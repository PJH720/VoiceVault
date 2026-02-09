#!/usr/bin/env bash

# VoiceVault Development Environment Setup Script
# This script automates the setup of the local development environment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect OS
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

# Verify Python version
verify_python() {
    print_step "Verifying Python installation..."

    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.11 or 3.12."
        exit 1
    fi

    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

    if [ "$PYTHON_MAJOR" -ne 3 ] || [ "$PYTHON_MINOR" -lt 11 ] || [ "$PYTHON_MINOR" -ge 13 ]; then
        print_error "Python 3.11 or 3.12 is required. Found: $PYTHON_VERSION"
        exit 1
    fi

    print_success "Python $PYTHON_VERSION is compatible"
}

# Create virtual environment
create_venv() {
    print_step "Creating virtual environment..."

    if [ -d ".venv" ]; then
        print_warning "Virtual environment already exists. Skipping creation."
    else
        python3 -m venv .venv
        print_success "Virtual environment created at .venv/"
    fi
}

# Activate virtual environment and upgrade pip
upgrade_pip() {
    print_step "Activating virtual environment and upgrading pip..."

    source .venv/bin/activate
    pip install --upgrade pip setuptools wheel
    print_success "pip, setuptools, and wheel upgraded"
}

# Install dependencies
install_dependencies() {
    print_step "Installing Python dependencies..."

    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt
        print_success "Core dependencies installed"
    else
        print_error "requirements.txt not found"
        exit 1
    fi

    # Install dev dependencies
    print_step "Installing development dependencies..."
    pip install pytest pytest-asyncio pytest-cov pytest-mock ruff mypy bandit
    print_success "Development dependencies installed"
}

# Create data directories
create_directories() {
    print_step "Creating data directories..."

    mkdir -p data/recordings
    mkdir -p data/exports
    mkdir -p logs

    print_success "Data directories created"
}

# Copy .env.example to .env
setup_env_file() {
    print_step "Setting up environment file..."

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

# Download Whisper model
download_whisper_model() {
    print_step "Downloading Whisper base model..."

    python scripts/download_models.py --model base
    print_success "Whisper base model downloaded"
}

# Install Ollama (optional)
install_ollama() {
    print_step "Checking for Ollama installation..."

    if command -v ollama &> /dev/null; then
        print_success "Ollama is already installed"

        # Pull llama3.2 model
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
            if [ "$OS" == "macOS" ]; then
                print_step "Installing Ollama for macOS..."
                curl -fsSL https://ollama.com/install.sh | sh
            elif [ "$OS" == "Linux" ]; then
                print_step "Installing Ollama for Linux..."
                curl -fsSL https://ollama.com/install.sh | sh
            fi

            print_success "Ollama installed"

            # Pull llama3.2 model
            print_step "Pulling llama3.2 model..."
            ollama pull llama3.2
            print_success "llama3.2 model pulled"
        else
            print_warning "Skipping Ollama installation"
        fi
    fi
}

# Print next steps
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
    echo "  3. Start the development server:"
    echo "     ${BLUE}uvicorn src.api.app:app --reload${NC}"
    echo
    echo "  4. Or use Docker Compose:"
    echo "     ${BLUE}docker-compose up${NC}"
    echo
    echo "  5. Run tests:"
    echo "     ${BLUE}pytest${NC}"
    echo
    echo "For more information, see README.md and CLAUDE.md"
    echo
}

# Main execution
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}VoiceVault Development Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo

    detect_os
    verify_python
    create_venv
    upgrade_pip
    install_dependencies
    create_directories
    setup_env_file
    download_whisper_model
    install_ollama
    print_next_steps
}

# Run main function
main
