# Contributing to Cotiza

Thank you for your interest in contributing to Cotiza! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 15+ (or use Docker)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/madfam/digifab-quoting.git
cd digifab-quoting

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start development services
docker-compose up -d

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

## Branch Strategy

We use a trunk-based development model:

- `main` - Production-ready code
- `feat/` - New features (e.g., `feat/multi-currency-support`)
- `fix/` - Bug fixes (e.g., `fix/fff-calculator-accuracy`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`)
- `docs/` - Documentation updates

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**

```
feat(calculator): add SLS process support
fix(pricing): correct material density calculations
docs(api): update quote endpoint documentation
```

## Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** with clear, atomic commits
3. **Write/update tests** for new functionality
4. **Update documentation** if needed
5. **Open a PR** with a clear description
6. **Request review** from a maintainer
7. **Address feedback** and get approval
8. **Squash and merge** to `main`

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated for significant changes
- [ ] No console.log statements in production code

## Code Standards

### TypeScript

- Strict mode enabled
- Explicit return types on functions
- Prefer interfaces over type aliases for objects
- Use Zod for runtime validation

### API Development

- RESTful conventions
- Consistent error responses
- Input validation with Zod schemas
- OpenAPI documentation for all endpoints

### Testing

- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical flows (quote → checkout)
- Minimum 80% coverage for new code

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test -- path/to/test.spec.ts
```

## Pricing Engine Guidelines

When modifying the pricing engine:

1. **Document formulas** - All calculations must be documented
2. **Test edge cases** - Zero dimensions, extreme values, currency conversions
3. **Validate against real quotes** - Compare with production data if available
4. **Consider multi-currency** - All prices must work in USD, MXN, EUR

## Security Guidelines

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all user inputs
- Follow OWASP guidelines for web security
- Report vulnerabilities to security@madfam.io

## Getting Help

- **Discord**: Join our developer channel
- **Issues**: Open a GitHub issue for bugs
- **Discussions**: Use GitHub Discussions for questions

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read and follow our Code of Conduct.

## License

By contributing, you agree that your contributions will be licensed under the project's proprietary license.
