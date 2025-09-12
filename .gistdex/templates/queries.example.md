# Gistdex Query Templates

## Successful Query Patterns

This file contains tested and proven query patterns for different use cases.

### Documentation Search

#### Stage 1: Broad Discovery

```json
{
  "query": "API overview endpoints",
  "hybrid": true,
  "k": 15
}
```

**Purpose**: Find all API-related documentation using keyword matching.

#### Stage 2: Specific Topic

```json
{
  "query": "user authentication flow JWT token",
  "hybrid": false,
  "k": 5
}
```

**Purpose**: Deep semantic search for authentication concepts.

#### Stage 3: Complete Sections

```json
{
  "query": "POST /auth/login endpoint documentation",
  "section": true,
  "k": 1
}
```

**Purpose**: Retrieve the complete markdown section for the login endpoint.

### Code Search

#### Finding Classes/Components

```json
{
  "query": "UserController class implementation",
  "hybrid": true,
  "k": 10
}
```

#### Finding Specific Methods

```json
{
  "query": "validateUser method authentication logic",
  "hybrid": false,
  "k": 5
}
```

#### Finding Usage Examples

```json
{
  "query": "UserController usage examples tests",
  "hybrid": true,
  "k": 10,
  "type": "file"
}
```

### Configuration Search

#### Database Configuration

```json
{
  "query": "database connection pool settings",
  "hybrid": true,
  "k": 5
}
```

#### Environment Variables

```json
{
  "query": "environment variables API keys secrets",
  "hybrid": true,
  "k": 10
}
```

### Architecture Search

#### System Design

```json
{
  "query": "microservices architecture diagram",
  "hybrid": false,
  "section": true,
  "k": 3
}
```

#### Design Patterns

```json
{
  "query": "repository pattern data access layer",
  "hybrid": false,
  "k": 5
}
```

## Multi-Stage Query Workflows

### Complete API Documentation Workflow

1. **Discover all endpoints**
   ```json
   {
     "query": "API endpoints REST routes",
     "hybrid": true,
     "k": 20
   }
   ```

2. **Focus on authentication**
   ```json
   {
     "query": "authentication endpoints JWT bearer token",
     "hybrid": false,
     "k": 10
   }
   ```

3. **Get complete auth section**
   ```json
   {
     "query": "authentication and authorization",
     "section": true,
     "k": 3
   }
   ```

### Debugging Workflow

1. **Find error patterns**
   ```json
   {
     "query": "error handling try catch exception",
     "hybrid": true,
     "k": 15
   }
   ```

2. **Locate specific error handler**
   ```json
   {
     "query": "ValidationError handler middleware",
     "hybrid": false,
     "k": 5
   }
   ```

3. **Find related tests**
   ```json
   {
     "query": "ValidationError test cases unit tests",
     "hybrid": true,
     "type": "file",
     "k": 10
   }
   ```

### Feature Implementation Workflow

1. **Research existing patterns**
   ```json
   {
     "query": "similar feature implementation pattern",
     "hybrid": true,
     "k": 15
   }
   ```

2. **Find specific implementations**
   ```json
   {
     "query": "data validation schema mongoose model",
     "hybrid": false,
     "k": 5
   }
   ```

3. **Get documentation**
   ```json
   {
     "query": "data validation best practices",
     "section": true,
     "k": 3
   }
   ```

## Query Optimization Patterns

### Performance-Optimized Queries

For large codebases, use filters and smaller k values:

```json
{
  "query": "database query optimization",
  "type": "file",
  "hybrid": false,
  "k": 3,
  "rerank": false
}
```

### Precision-Optimized Queries

For exact matches, use hybrid with reranking:

```json
{
  "query": "getUserById function implementation",
  "hybrid": true,
  "k": 5,
  "rerank": true
}
```

### Coverage-Optimized Queries

For comprehensive results, use larger k values:

```json
{
  "query": "test coverage unit tests integration",
  "hybrid": true,
  "k": 30,
  "rerank": true
}
```

## Special Cases

### Searching in Specific File Types

```json
{
  "query": "configuration settings",
  "hybrid": true,
  "k": 10,
  "type": "gist"
}
```

### Finding Recent Changes

```json
{
  "query": "TODO FIXME deprecated",
  "hybrid": true,
  "k": 20
}
```

### Security Audit Queries

```json
{
  "query": "password secret key token credential",
  "hybrid": true,
  "k": 30
}
```

## Tips for Creating Custom Queries

1. **Start with hybrid search** for unknown content
2. **Use semantic search** when you know the concepts
3. **Add section=true** for markdown documentation
4. **Adjust k value** based on needed coverage
5. **Use type filters** to narrow scope
6. **Cache successful patterns** for reuse

## Query Cache Management

Successful queries are automatically cached. To build your own cache:

1. Run successful queries
2. Check `.gistdex/cache/queries.md` for patterns
3. Copy effective queries to this template file
4. Share with team for consistency