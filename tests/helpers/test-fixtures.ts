import type { VectorSearchResult } from "../../src/core/vector-db/adapters/types.js";

export const testDocuments = {
  typescript: {
    content: `TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.
It adds optional static typing and class-based object-oriented programming to the language.
TypeScript is designed for the development of large applications and transcompiles to JavaScript.`,
    metadata: {
      title: "TypeScript Introduction",
      sourceType: "documentation",
      language: "en",
      tags: ["typescript", "javascript", "programming"],
    },
  },

  javascript: {
    content: `JavaScript is a high-level, interpreted programming language that conforms to the ECMAScript specification.
JavaScript has curly-bracket syntax, dynamic typing, prototype-based object-orientation, and first-class functions.`,
    metadata: {
      title: "JavaScript Overview",
      sourceType: "documentation",
      language: "en",
      tags: ["javascript", "programming", "web"],
    },
  },

  python: {
    content: `Python is an interpreted, high-level, general-purpose programming language.
Its design philosophy emphasizes code readability with notable use of whitespace.
Python's language constructs and object-oriented approach aim to help programmers write clear, logical code.`,
    metadata: {
      title: "Python Language",
      sourceType: "documentation",
      language: "en",
      tags: ["python", "programming", "scripting"],
    },
  },

  gistdex: {
    content: `Gistdex is a semantic search tool that indexes content from various sources.
It uses vector embeddings to enable similarity-based search across indexed documents.
The tool supports indexing from GitHub Gists, repositories, local files, and plain text.`,
    metadata: {
      title: "Gistdex Documentation",
      sourceType: "documentation",
      language: "en",
      tags: ["gistdex", "search", "indexing"],
    },
  },
};

export const testCode = {
  typescript: `interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

class UserService {
  private users: Map<string, User> = new Map();

  async createUser(data: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }
}`,

  python: `from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict
import uuid

@dataclass
class User:
    id: str
    name: str
    email: str
    created_at: datetime

class UserService:
    def __init__(self):
        self.users: Dict[str, User] = {}

    async def create_user(self, name: str, email: str) -> User:
        user = User(
            id=str(uuid.uuid4()),
            name=name,
            email=email,
            created_at=datetime.now()
        )
        self.users[user.id] = user
        return user

    async def get_user(self, user_id: str) -> Optional[User]:
        return self.users.get(user_id)`,

  javascript: `class User {
  constructor(name, email) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.email = email;
    this.createdAt = new Date();
  }
}

class UserService {
  constructor() {
    this.users = new Map();
  }

  async createUser(name, email) {
    const user = new User(name, email);
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id) {
    return this.users.get(id);
  }
}`,
};

export function createMockSearchResult(
  content: string,
  score: number = 0.9,
  metadata: Record<string, unknown> = {},
): VectorSearchResult {
  return {
    id: crypto.randomUUID(),
    content,
    score,
    metadata: {
      sourceType: "text",
      ...metadata,
    },
  };
}

export function createMockSearchResults(
  count: number = 5,
  baseScore: number = 0.9,
): VectorSearchResult[] {
  const results: VectorSearchResult[] = [];
  const documents = Object.values(testDocuments);

  for (let i = 0; i < count; i++) {
    const doc = documents[i % documents.length];
    if (doc) {
      results.push(
        createMockSearchResult(doc.content, baseScore - i * 0.05, doc.metadata),
      );
    }
  }

  return results;
}

export function createTestChunks(
  text: string,
  chunkSize: number = 100,
  overlap: number = 20,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;

    if (start >= text.length - overlap) {
      break;
    }
  }

  return chunks;
}

export const testQueries = {
  typescript: "What is TypeScript and how does it relate to JavaScript?",
  python: "Tell me about Python programming language design philosophy",
  javascript: "JavaScript ECMAScript specification and features",
  programming: "programming language static typing object-oriented",
  gistdex: "semantic search vector embeddings indexing",
};

export const testGitHubUrls = {
  validGist: "https://gist.github.com/user/1234567890abcdef",
  validRepo: "https://github.com/owner/repo",
  invalidUrl: "https://example.com/not-github",
  malformedUrl: "not-a-url",
};

export const testFilePaths = {
  typescript: "/project/src/index.ts",
  javascript: "/project/lib/utils.js",
  python: "/scripts/main.py",
  markdown: "/docs/README.md",
  json: "/config/package.json",
};
