#!/bin/bash

# Build Lambda deployment package
echo "Building Lambda deployment package..."

# Clean up
rm -rf lambda-package
mkdir -p lambda-package

# Copy source files
cp -r *.js *.ts *.json routes services middleware utils types lambda-package/

# Install production dependencies
cd lambda-package
npm ci --production --omit=dev

# Create zip
zip -r ../lambda-deployment.zip .

cd ..
echo "Lambda package created: lambda-deployment.zip"