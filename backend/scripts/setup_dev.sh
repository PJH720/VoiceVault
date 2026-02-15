#!/usr/bin/env bash

# VoiceVault Development Environment Setup Script
# Uses uv for Python version management and package installation.
# Target: Python 3.12
#
# Run from the repo root:  bash backend/scripts/setup_dev.sh

set -e  # Exit on error

# ANSI color codes for readable terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color (reset)

PYTHON_VERSION="3.12"

# Resolve the repository root (two levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

# ---- Helper functions for consistent log formatting ----

# Print a blue step indicator (informational progress)
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

# Print a green success indicator
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Print a yellow warning indicator (non-fatal)
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Print a red error indicator (fatal)
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect the host operating system (macOS or Linux).
# Sets the global $OS variable used by later steps (e.g. brew vs curl install).
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            OS="macOS"
            ;;
        Linux*)
            OS="Linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    print_success "Detected OS: $OS"
}

# Install the uv package manager if it is not already available on $PATH.
# On macOS with Homebrew, uses `brew install`; otherwise uses the official install script.
install_uv() {
    print_step "Checking for uv installation..."

    if command -v uv &> /dev/null; then
        UV_VERSION=$(uv --version)
        print_success "uv is already installed ($UV_VERSION)"
    else
        print_step "Installing uv..."
        if [ "$OS" == "macOS" ] && command -v brew &> /dev/null; then
            brew install uv
        else
            curl -LsSf https://astral.sh/uv/install.sh | sh
        fi
        print_success "uv installed"
    fi
}

# Create a .venv virtual environment with the target Python version.
# If a .venv already exists with the correct version, it is reused.
# If the version differs, the old .venv is deleted and recreated.
create_venv() {
    print_step "Creating virtual environment with Python ${PYTHON_VERSION}..."

    cd "$REPO_ROOT"

    if [ -d ".venv" ]; then
        # Verify existing venv Python version
        EXISTING_VERSION=$(.venv/bin/python --version 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1-2)
        if [ "$EXISTING_VERSION" == "$PYTHON_VERSION" ]; then
            print_warning "Virtual environment already exists with Python ${EXISTING_VERSION}. Skipping."
            return
        else
            print_warning "Existing venv uses Python ${EXISTING_VERSION}. Recreating with ${PYTHON_VERSION}..."
            rm -rf .venv
        fi
    fi

    uv venv --python "$PYTHON_VERSION"
    print_success "Virtual environment created at .venv/ (Python ${PYTHON_VERSION})"
}

# Install Python dependencies into the active .venv using uv.
# First installs core deps from backend/requirements.txt, then dev deps from backend/pyproject.toml.
install_dependencies() {
    print_step "Installing Python dependencies via uv..."

    cd "$BACKEND_DIR"

    if [ -f "requirements.txt" ]; then
        uv pip install -r requirements.txt
        print_success "Core dependencies installed"
    else
        print_error "backend/requirements.txt not found"
        exit 1
    fi

    # Install dev dependencies
    print_step "Installing development dependencies via uv..."
    if [ -f "pyproject.toml" ]; then
        uv pip install -e ".[dev]"
        print_success "Development dependencies installed"
    else
        uv pip install pytest pytest-asyncio pytest-cov pytest-env pytest-mock ruff mypy bandit
        print_success "Development dependencies installed (fallback)"
    fi

    cd "$REPO_ROOT"
}

# Create runtime data directories that are gitignored.
# These hold recordings, Obsidian exports, and application logs.
create_directories() {
    print_step "Creating data directories..."

    mkdir -p "$REPO_ROOT/data/recordings"
    mkdir -p "$REPO_ROOT/data/exports"
    mkdir -p "$BACKEND_DIR/logs"

    print_success "Data directories created"
}

# Copy .env.example to .env if .env does not already exist.
# The user must then edit .env to configure API keys and providers.
setup_env_file() {
    print_step "Setting up environment file..."

    cd "$REPO_ROOT"

    if [ -f ".env" ]; then
        print_warning ".env file already exists. Skipping."
    else
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_success ".env file created from .env.example"
            print_warning "Please edit .env to configure your settings"
        else
            print_error ".env.example not found"
        fi
    fi
}

# Download the default Whisper "base" model for speech-to-text.
# Uses the download_models.py script inside the newly created .venv.
download_whisper_model() {
    print_step "Downloading Whisper base model..."

    "$REPO_ROOT/.venv/bin/python" "$BACKEND_DIR/scripts/download_models.py" --model base
    print_success "Whisper base model downloaded"
}

# Optionally install Ollama (local LLM runtime) and pull the llama3.2 model.
# Prompts the user interactively before installing or pulling.
install_ollama() {
    print_step "Checking for Ollama installation..."

    if command -v ollama &> /dev/null; then
        print_success "Ollama is already installed"

        read -p "Would you like to pull the llama3.2 model? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_step "Pulling llama3.2 model..."
            ollama pull llama3.2
            print_success "llama3.2 model pulled"
        fi
    else
        read -p "Ollama is not installed. Would you like to install it? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_step "Installing Ollama..."
            curl -fsSL https://ollama.com/install.sh | sh
            print_success "Ollama installed"

            print_step "Pulling llama3.2 model..."
            ollama pull llama3.2
            print_success "llama3.2 model pulled"
        else
            print_warning "Skipping Ollama installation"
        fi
    fi
}

# Display post-setup instructions: how to activate the venv, configure .env,
# start the dev server, run Docker, and execute tests.
print_next_steps() {
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Setup Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    echo "Next steps:"
    echo "  1. Activate the virtual environment:"
    echo "     ${BLUE}source .venv/bin/activate${NC}"
    echo
    echo "  2. Edit .env file to configure your settings:"
    echo "     ${BLUE}nano .env${NC}"
    echo
    echo "  3. Start the backend API server:"
    echo "     ${BLUE}PYTHONPATH=backend uvicorn src.api.app:app --reload${NC}"
    echo
    echo "  4. Or use Docker Compose:"
    echo "     ${BLUE}docker compose up${NC}"
    echo
    echo "  5. Run tests:"
    echo "     ${BLUE}cd backend && pytest${NC}"
    echo
    echo "Note: Always use 'uv pip install ...' instead of 'pip install ...'"
    echo "For more information, see README.md and CLAUDE.md"
    echo
}

# Main execution — orchestrates all setup steps in order.
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}VoiceVault Development Setup (uv)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo

    detect_os
    install_uv
    create_venv
    install_dependencies
    create_directories
    setup_env_file
    download_whisper_model
    install_ollama
    print_next_steps
}

# Run main function
main
