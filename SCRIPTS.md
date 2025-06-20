# QuickSight Assets Portal - Scripts Guide

## 🚀 Quick Start

```bash
# Install everything
npm run install:all

# Start development
npm run dev

# Deploy to AWS
npm run deploy
```

## 📋 All Available Scripts

### Development
- `npm run dev` - Start both backend and frontend in development mode
- `npm run dev:backend` - Start only backend in development mode  
- `npm run dev:frontend` - Start only frontend in development mode
- `npm start` - Start backend server (production mode)

### Building
- `npm run build` - Build both backend and frontend
- `npm run build:backend` - Build only backend
- `npm run build:frontend` - Build only frontend

### Code Quality
- `npm run lint` - Check code style for both backend and frontend
- `npm run lint:fix` - Auto-fix code style issues
- `npm test` - Run backend tests

### Maintenance
- `npm run install:all` - Install dependencies for all projects
- `npm run clean` - Remove build artifacts (dist, cdk.out)
- `npm run clean:full` - Remove everything (node_modules, package-lock, dist)
- `npm run reinstall` - Clean everything and reinstall (nuclear option)

### Deployment
- `npm run deploy` - Standard deployment (builds and deploys)
- `npm run deploy:prod` - Production deployment (no approval needed)
- `npm run deploy:fresh` - Clean install + deploy (use when dependencies change)

### AWS CDK
- `npm run cdk:synth` - Synthesize CloudFormation templates
- `npm run cdk:diff` - Show what will change in next deployment
- `npm run cdk:bootstrap` - Bootstrap CDK (first time setup)
- `npm run cdk:destroy` - Destroy all AWS resources

## 🎯 Common Workflows

### First Time Setup
```bash
npm run install:all
npm run cdk:bootstrap
npm run deploy
```

### Daily Development
```bash
npm run dev
# Make changes...
npm run lint:fix
npm test
```

### Deploy Code Changes
```bash
npm run deploy
```

### Deploy After Package Updates
```bash
npm run deploy:fresh
```

### Check What Will Deploy
```bash
npm run cdk:diff
```

### Clean Rebuild Everything
```bash
npm run reinstall
npm run build
```