#!/bin/bash

# SQLite vs DuckDB Benchmark Script
# This script compares the performance of SQLite and DuckDB for indexing and searching C++ source files

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$PROJECT_ROOT/data"
SQLITE_DB="$TMP_DIR/benchmark-sqlite.db"
DUCKDB_DB="$TMP_DIR/benchmark-duckdb.db"
DUCKDB_REPO="$TMP_DIR/duckdb"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to clean up previous benchmark data
cleanup_previous_run() {
    print_info "Cleaning up previous benchmark data..."
    rm -f "$SQLITE_DB" "$DUCKDB_DB"
    rm -f "$TMP_DIR/bench-sqlite.db" "$TMP_DIR/bench-duckdb.db"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if hyperfine is installed
    if ! command -v hyperfine &> /dev/null; then
        print_error "hyperfine is not installed. Please install it first."
        echo "  cargo install hyperfine"
        exit 1
    fi

    # Check if DuckDB repo is cloned
    if [ ! -d "$DUCKDB_REPO" ]; then
        print_error "DuckDB repository not found. Cloning..."
        cd "$TMP_DIR"
        git clone https://github.com/duckdb/duckdb.git --depth 1
        cd "$PROJECT_ROOT"
    fi

    # Count C++ files
    local file_count=$(find "$DUCKDB_REPO/src" -name "*.cpp" | wc -l)
    print_success "Found $file_count C++ files in DuckDB repository"
}

# Function to benchmark indexing performance
benchmark_indexing() {
    print_info "==================================================="
    print_info "BENCHMARK: Indexing Performance"
    print_info "==================================================="

    # Clean up temp databases for indexing benchmark
    rm -f "$TMP_DIR/bench-sqlite.db" "$TMP_DIR/bench-duckdb.db"

    hyperfine \
        --warmup 1 \
        --min-runs 3 \
        --export-markdown "$TMP_DIR/indexing-benchmark.md" \
        --export-json "$TMP_DIR/indexing-benchmark.json" \
        -n "SQLite Indexing" \
        -n "DuckDB Indexing" \
        "node dist/cli/index.js index --provider sqlite --db '$TMP_DIR/bench-sqlite.db' --files '$DUCKDB_REPO/src/**/*.cpp' --chunk-size 1000 --chunk-overlap 200 -p" \
        "node dist/cli/index.js index --provider duckdb --db '$TMP_DIR/bench-duckdb.db' --files '$DUCKDB_REPO/src/**/*.cpp' --chunk-size 1000 --chunk-overlap 200 -p"

    # Clean up temp databases after benchmark
    rm -f "$TMP_DIR/bench-sqlite.db" "$TMP_DIR/bench-duckdb.db"
}

# Function to benchmark single query performance
benchmark_single_query() {
    print_info "==================================================="
    print_info "BENCHMARK: Single Query Performance"
    print_info "==================================================="

    local query="database storage optimization"

    print_info "Query: '$query'"

    hyperfine \
        --warmup 3 \
        --min-runs 10 \
        --export-markdown "$TMP_DIR/single-query-benchmark.md" \
        --export-json "$TMP_DIR/single-query-benchmark.json" \
        -n "SQLite Query" \
        -n "DuckDB Query" \
        "node dist/cli/index.js query --provider sqlite --db '$SQLITE_DB' -k 10 '$query'" \
        "node dist/cli/index.js query --provider duckdb --db '$DUCKDB_DB' -k 10 '$query'"
}

# Function to benchmark multiple queries
benchmark_multiple_queries() {
    print_info "==================================================="
    print_info "BENCHMARK: Multiple Query Performance"
    print_info "==================================================="

    # Create a script for multiple queries
    cat > "$TMP_DIR/run-queries-sqlite.sh" << 'EOF'
#!/bin/bash
queries=("database" "vector" "index" "query optimization" "storage engine")
for query in "${queries[@]}"; do
    node dist/cli/index.js query --provider sqlite --db "$1" -k 10 "$query" > /dev/null
done
EOF

    cat > "$TMP_DIR/run-queries-duckdb.sh" << 'EOF'
#!/bin/bash
queries=("database" "vector" "index" "query optimization" "storage engine")
for query in "${queries[@]}"; do
    node dist/cli/index.js query --provider duckdb --db "$1" -k 10 "$query" > /dev/null
done
EOF

    chmod +x "$TMP_DIR/run-queries-sqlite.sh"
    chmod +x "$TMP_DIR/run-queries-duckdb.sh"

    hyperfine \
        --warmup 2 \
        --min-runs 5 \
        --export-markdown "$TMP_DIR/multiple-queries-benchmark.md" \
        --export-json "$TMP_DIR/multiple-queries-benchmark.json" \
        -n "SQLite (5 queries)" \
        -n "DuckDB (5 queries)" \
        "$TMP_DIR/run-queries-sqlite.sh '$SQLITE_DB'" \
        "$TMP_DIR/run-queries-duckdb.sh '$DUCKDB_DB'"
}

# Function to display results summary
display_results() {
    print_info "==================================================="
    print_info "BENCHMARK RESULTS SUMMARY"
    print_info "==================================================="

    if [ -f "$TMP_DIR/indexing-benchmark.md" ]; then
        echo ""
        print_success "Indexing Performance:"
        cat "$TMP_DIR/indexing-benchmark.md"
    fi

    if [ -f "$TMP_DIR/single-query-benchmark.md" ]; then
        echo ""
        print_success "Single Query Performance:"
        cat "$TMP_DIR/single-query-benchmark.md"
    fi

    if [ -f "$TMP_DIR/multiple-queries-benchmark.md" ]; then
        echo ""
        print_success "Multiple Queries Performance:"
        cat "$TMP_DIR/multiple-queries-benchmark.md"
    fi

    echo ""
    print_info "Detailed JSON results saved in:"
    echo "  - $TMP_DIR/indexing-benchmark.json"
    echo "  - $TMP_DIR/single-query-benchmark.json"
    echo "  - $TMP_DIR/multiple-queries-benchmark.json"
}

# Main execution
main() {
    print_info "Starting SQLite vs DuckDB Benchmark"
    print_info "Project root: $PROJECT_ROOT"

    # Change to project root
    cd "$PROJECT_ROOT"

    # Run benchmark steps
    check_prerequisites
    cleanup_previous_run

    # Ask user what to benchmark
    echo ""
    print_info "Select benchmark mode:"
    echo "  1) Full benchmark (indexing + queries)"
    echo "  2) Indexing only"
    echo "  3) Queries only (requires existing indexes)"
    read -p "Enter choice [1-3]: " choice

    case $choice in
        1)
            benchmark_indexing
            benchmark_single_query
            benchmark_multiple_queries
            ;;
        2)
            benchmark_indexing
            ;;
        3)
            benchmark_single_query
            benchmark_multiple_queries
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac

    display_results
    print_success "Benchmark completed!"
}

# Run main function
main "$@"