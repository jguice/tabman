#!/bin/bash

# Clean up previous build
rm -rf workflow Tabman.alfredworkflow

# Create workflow directory
mkdir -p workflow

# Copy files
cp search_*.js info.plist README.md icon.png workflow/

# Ensure scripts are executable
chmod +x workflow/search_*.js

# Create workflow package
cd workflow
zip -r ../Tabman.alfredworkflow .
cd ..

echo "Build complete! Tabman.alfredworkflow has been created."
