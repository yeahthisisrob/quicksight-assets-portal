# Contributing to QuickSight Assets Portal

First off, thank you for considering contributing to QuickSight Assets Portal! It's people like you that make this tool better for everyone.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title
* Describe the exact steps which reproduce the problem
* Provide specific examples to demonstrate the steps
* Describe the behavior you observed after following the steps
* Explain which behavior you expected to see instead and why
* Include screenshots if relevant
* Include your environment details (OS, Node.js version, AWS region, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* Use a clear and descriptive title
* Provide a step-by-step description of the suggested enhancement
* Provide specific examples to demonstrate the steps
* Describe the current behavior and explain which behavior you expected to see instead
* Explain why this enhancement would be useful

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Follow the TypeScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

1. Fork the repo and create your branch from `main`
2. Make your changes
3. If you've added code that should be tested, add tests
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/quicksight-assets-portal.git
cd quicksight-assets-portal

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Run tests
cd backend && npm test
cd ../frontend && npm test

# Run linting
cd backend && npm run lint
cd ../frontend && npm run lint
```

### Code Style

* Use TypeScript for all new code
* Follow existing code formatting
* Use meaningful variable and function names
* Add comments for complex logic
* Keep functions small and focused

### Testing

* Write unit tests for new functionality
* Ensure all tests pass before submitting PR
* Include both positive and negative test cases
* Mock AWS SDK calls appropriately

### Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

## Project Structure

Before contributing, familiarize yourself with the project structure:

* `/backend` - Node.js/Express backend
  * `/routes` - API endpoints
  * `/services` - Business logic and AWS integrations
  * `/utils` - Utility functions
* `/frontend` - React/TypeScript frontend
  * `/src/components` - Reusable React components
  * `/src/pages` - Page components
  * `/src/services` - API client services
  * `/src/types` - TypeScript type definitions

## AWS Considerations

When working with AWS-related features:

* Never commit AWS credentials
* Use environment variables for configuration
* Test with minimal AWS permissions
* Consider costs implications of API calls
* Handle AWS service limits gracefully

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing! 🎉