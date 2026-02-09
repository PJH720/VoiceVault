#!/usr/bin/env python3
"""
VoiceVault Whisper Model Downloader

Downloads and caches Whisper models for offline use.
Supports all faster-whisper model sizes.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Error: faster-whisper is not installed.")
    print("Please install it with: pip install faster-whisper")
    sys.exit(1)


# Model information
MODELS = {
    "tiny": {"size": "39 MB", "description": "Fastest, lowest accuracy"},
    "base": {"size": "142 MB", "description": "Good balance for development"},
    "small": {"size": "466 MB", "description": "Better accuracy"},
    "medium": {"size": "1.5 GB", "description": "High accuracy, slower"},
    "turbo": {"size": "809 MB", "description": "Optimized for speed (English only)"},
    "large-v3": {"size": "3.1 GB", "description": "Best accuracy, slowest"},
}

DEFAULT_MODEL = "base"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "huggingface" / "hub"


def print_models():
    """Print available models with their sizes and descriptions."""
    print("\nAvailable Whisper Models:")
    print("-" * 60)
    for model_name, info in MODELS.items():
        print(f"  {model_name:12} - {info['size']:8} - {info['description']}")
    print("-" * 60)
    print(f"\nDefault model: {DEFAULT_MODEL}")
    print(f"Default cache directory: {DEFAULT_CACHE_DIR}\n")


def download_model(
    model_name: str,
    cache_dir: Optional[Path] = None,
    device: str = "cpu",
    compute_type: str = "int8",
) -> bool:
    """
    Download a Whisper model.

    Args:
        model_name: Name of the model to download
        cache_dir: Directory to cache the model
        device: Device to use (cpu or cuda)
        compute_type: Compute type (int8, float16, float32)

    Returns:
        True if successful, False otherwise
    """
    if model_name not in MODELS:
        print(f"Error: Unknown model '{model_name}'")
        print_models()
        return False

    if cache_dir is None:
        cache_dir = DEFAULT_CACHE_DIR

    print(f"\n{'='*60}")
    print(f"Downloading Whisper model: {model_name}")
    print(f"Size: {MODELS[model_name]['size']}")
    print(f"Cache directory: {cache_dir}")
    print(f"Device: {device}")
    print(f"Compute type: {compute_type}")
    print(f"{'='*60}\n")

    try:
        # Create cache directory if it doesn't exist
        cache_dir.mkdir(parents=True, exist_ok=True)

        print("Initializing model download...")
        print("This may take a few minutes depending on your connection.\n")

        # Download model by initializing WhisperModel
        model = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            download_root=str(cache_dir),
        )

        print(f"\n✓ Successfully downloaded {model_name} model!")
        print(f"  Cache location: {cache_dir}\n")

        # Clean up
        del model

        return True

    except Exception as e:
        print(f"\n✗ Error downloading model: {e}")
        return False


def download_all_models(cache_dir: Optional[Path] = None):
    """Download all available Whisper models."""
    print("\nDownloading all Whisper models...")
    print("This will download approximately 6.5 GB of data.\n")

    success_count = 0
    for model_name in MODELS.keys():
        if download_model(model_name, cache_dir):
            success_count += 1

    print(f"\n{'='*60}")
    print(f"Downloaded {success_count}/{len(MODELS)} models successfully")
    print(f"{'='*60}\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Download Whisper models for VoiceVault",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Model to download (default: {DEFAULT_MODEL})",
    )

    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help=f"Cache directory (default: {DEFAULT_CACHE_DIR})",
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Download all available models",
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List available models and exit",
    )

    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device to use (default: cpu)",
    )

    parser.add_argument(
        "--compute-type",
        type=str,
        default="int8",
        choices=["int8", "float16", "float32"],
        help="Compute type (default: int8)",
    )

    args = parser.parse_args()

    # List models and exit
    if args.list:
        print_models()
        return

    # Download all models
    if args.all:
        download_all_models(args.cache_dir)
        return

    # Download specific model
    success = download_model(
        args.model,
        args.cache_dir,
        args.device,
        args.compute_type,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
