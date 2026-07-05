"""CLI entry point for construction palletizer (registered via pyproject scripts)."""

from .pallet_optimizer import ConstructionPalletOptimizer, main as optimizer_main

def main():
    """Entry point for `palletize-construction` CLI."""
    print("Palletizer OS — Construction Materials Optimizer v1.0")
    print("One codebase. Any robot. Perfect for drywall, lumber, bagged goods, prefab.")
    optimizer_main()
