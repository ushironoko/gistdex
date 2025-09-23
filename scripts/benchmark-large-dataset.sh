#!/bin/bash

# Large Dataset Benchmark: SQLite vs DuckDB
# Test with all C++ files from DuckDB repository (2,371 files)

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$PROJECT_ROOT/tmp"
SQLITE_DB="$TMP_DIR/benchmark-large-sqlite.db"
DUCKDB_DB="$TMP_DIR/benchmark-large-duckdb.db"
DUCKDB_REPO="$TMP_DIR/duckdb"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
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

print_header() {
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "CHECKING PREREQUISITES"

    if ! command -v hyperfine &> /dev/null; then
        print_error "hyperfine is not installed. Please install it first."
        exit 1
    fi

    if [ ! -d "$DUCKDB_REPO" ]; then
        print_error "DuckDB repository not found."
        exit 1
    fi

    # Count files
    local cpp_count=$(find "$DUCKDB_REPO" -name "*.cpp" | wc -l)
    local hpp_count=$(find "$DUCKDB_REPO" -name "*.hpp" | wc -l)
    local total_count=$((cpp_count + hpp_count))

    print_success "Found $cpp_count C++ files and $hpp_count header files"
    print_success "Total: $total_count files to index"

    # Estimate data size
    local total_size=$(find "$DUCKDB_REPO" -name "*.cpp" -exec du -ch {} + | grep total$ | awk '{print $1}')
    print_info "Total size of C++ files: $total_size"
}

# Clean up previous runs
cleanup_previous() {
    print_header "CLEANING UP PREVIOUS DATA"
    rm -f "$SQLITE_DB" "$DUCKDB_DB"
    rm -f "$TMP_DIR/bench-large-*.db"
    print_success "Cleaned up previous benchmark databases"
}

# Create indexes for benchmarking
create_indexes() {
    print_header "CREATING INDEXES FOR BENCHMARKS"

    # SQLite
    print_info "Creating SQLite index (this may take a while)..."
    local start_time=$(date +%s)

    npx gistdex index \
        --provider sqlite \
        --db "$SQLITE_DB" \
        --files "$DUCKDB_REPO/**/*.cpp" \
        --chunk-size 1000 \
        --chunk-overlap 200 \
        -p

    local end_time=$(date +%s)
    local sqlite_time=$((end_time - start_time))
    print_success "SQLite indexing completed in ${sqlite_time}s"

    # DuckDB with HNSW
    print_info "Creating DuckDB index with HNSW (this may take a while)..."
    start_time=$(date +%s)

    npx gistdex index \
        --provider duckdb \
        --db "$DUCKDB_DB" \
        --files "$DUCKDB_REPO/**/*.cpp" \
        --chunk-size 1000 \
        --chunk-overlap 200 \
        -p

    end_time=$(date +%s)
    local duckdb_time=$((end_time - start_time))
    print_success "DuckDB indexing completed in ${duckdb_time}s"

    # Show database sizes
    print_info "Database sizes:"
    ls -lh "$SQLITE_DB" "$DUCKDB_DB" | awk '{print "  " $9 ": " $5}'
}

# Benchmark indexing performance
benchmark_indexing() {
    print_header "BENCHMARK: INDEXING PERFORMANCE (2,371 C++ files)"

    rm -f "$TMP_DIR/bench-large-sqlite.db" "$TMP_DIR/bench-large-duckdb.db"

    hyperfine \
        --warmup 1 \
        --runs 2 \
        --export-markdown "$TMP_DIR/large-indexing-benchmark.md" \
        --export-json "$TMP_DIR/large-indexing-benchmark.json" \
        -n "SQLite Indexing (2,371 files)" \
        -n "DuckDB HNSW Indexing (2,371 files)" \
        "npx gistdex index --provider sqlite --db '$TMP_DIR/bench-large-sqlite.db' --files '$DUCKDB_REPO/**/*.cpp' --chunk-size 1000 --chunk-overlap 200 -p" \
        "npx gistdex index --provider duckdb --db '$TMP_DIR/bench-large-duckdb.db' --files '$DUCKDB_REPO/**/*.cpp' --chunk-size 1000 --chunk-overlap 200 -p"

    rm -f "$TMP_DIR/bench-large-sqlite.db" "$TMP_DIR/bench-large-duckdb.db"
}

# Benchmark various query types
benchmark_queries() {
    print_header "BENCHMARK: QUERY PERFORMANCE"

    # Test different query complexities
    local queries=(
        "vector database"
        "query optimization algorithm"
        "memory management buffer pool allocation"
        "join hash aggregate window function partition"
        "transaction isolation concurrency control MVCC deadlock recovery"
    )

    for i in "${!queries[@]}"; do
        local query="${queries[$i]}"
        local complexity=$((i + 1))

        print_info "Testing Query Complexity Level $complexity: '$query'"

        hyperfine \
            --warmup 2 \
            --runs 5 \
            --export-json "$TMP_DIR/large-query-level${complexity}.json" \
            -n "SQLite (L${complexity})" \
            -n "DuckDB HNSW (L${complexity})" \
            "npx gistdex query --provider sqlite --db '$SQLITE_DB' -k 20 '$query'" \
            "npx gistdex query --provider duckdb --db '$DUCKDB_DB' -k 20 '$query'"

        # Show brief result
        echo ""
    done
}

# Benchmark concurrent queries
benchmark_concurrent() {
    print_header "BENCHMARK: CONCURRENT QUERY PERFORMANCE"

    # Create concurrent query script
    cat > "$TMP_DIR/concurrent-sqlite.sh" << 'EOF'
#!/bin/bash
for i in {1..10}; do
    npx gistdex query --provider sqlite --db "$1" -k 10 "database query optimization" > /dev/null &
done
wait
EOF

    cat > "$TMP_DIR/concurrent-duckdb.sh" << 'EOF'
#!/bin/bash
for i in {1..10}; do
    npx gistdex query --provider duckdb --db "$1" -k 10 "database query optimization" > /dev/null &
done
wait
EOF

    chmod +x "$TMP_DIR/concurrent-sqlite.sh" "$TMP_DIR/concurrent-duckdb.sh"

    hyperfine \
        --warmup 1 \
        --runs 3 \
        --export-json "$TMP_DIR/large-concurrent-benchmark.json" \
        -n "SQLite (10 concurrent queries)" \
        -n "DuckDB HNSW (10 concurrent queries)" \
        "$TMP_DIR/concurrent-sqlite.sh '$SQLITE_DB'" \
        "$TMP_DIR/concurrent-duckdb.sh '$DUCKDB_DB'"
}

# Generate comprehensive report
generate_report() {
    print_header "GENERATING COMPREHENSIVE REPORT"

    cat > "$TMP_DIR/large-dataset-benchmark-report.md" << EOF
# Large Dataset Benchmark Report

## Dataset Information
- **Source**: DuckDB Repository
- **Total C++ Files**: 2,371
- **Configuration**:
  - Chunk Size: 1000 characters
  - Chunk Overlap: 200 characters
  - Vector Dimensions: 768
  - DuckDB: HNSW enabled (cosine metric)

## Test Results

### 1. Indexing Performance
EOF

    if [ -f "$TMP_DIR/large-indexing-benchmark.md" ]; then
        cat "$TMP_DIR/large-indexing-benchmark.md" >> "$TMP_DIR/large-dataset-benchmark-report.md"
    fi

    echo "" >> "$TMP_DIR/large-dataset-benchmark-report.md"
    echo "### 2. Query Performance by Complexity" >> "$TMP_DIR/large-dataset-benchmark-report.md"

    for i in {1..5}; do
        if [ -f "$TMP_DIR/large-query-level${i}.json" ]; then
            echo "" >> "$TMP_DIR/large-dataset-benchmark-report.md"
            echo "#### Level $i Query Results" >> "$TMP_DIR/large-dataset-benchmark-report.md"
            # Extract mean times from JSON
            jq -r '.results[] | "- \(.command): \(.mean)s"' "$TMP_DIR/large-query-level${i}.json" >> "$TMP_DIR/large-dataset-benchmark-report.md"
        fi
    done

    echo "" >> "$TMP_DIR/large-dataset-benchmark-report.md"
    echo "### 3. Concurrent Query Performance" >> "$TMP_DIR/large-dataset-benchmark-report.md"

    if [ -f "$TMP_DIR/large-concurrent-benchmark.json" ]; then
        jq -r '.results[] | "- \(.command): \(.mean)s"' "$TMP_DIR/large-concurrent-benchmark.json" >> "$TMP_DIR/large-dataset-benchmark-report.md"
    fi

    print_success "Report generated at: $TMP_DIR/large-dataset-benchmark-report.md"
}

# Main execution
main() {
    print_header "LARGE DATASET BENCHMARK: SQLite vs DuckDB"
    print_info "Testing with 2,371 C++ files from DuckDB repository"

    cd "$PROJECT_ROOT"

    check_prerequisites
    cleanup_previous

    # Ask what to run
    echo ""
    print_info "Select benchmark mode:"
    echo "  1) Full benchmark (create indexes + all tests)"
    echo "  2) Quick test (use existing indexes)"
    echo "  3) Indexing only"
    read -p "Enter choice [1-3]: " choice

    case $choice in
        1)
            create_indexes
            benchmark_indexing
            benchmark_queries
            benchmark_concurrent
            generate_report
            ;;
        2)
            if [ ! -f "$SQLITE_DB" ] || [ ! -f "$DUCKDB_DB" ]; then
                print_warning "Indexes not found. Creating them first..."
                create_indexes
            fi
            benchmark_queries
            benchmark_concurrent
            generate_report
            ;;
        3)
            benchmark_indexing
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac

    print_success "Benchmark completed!"
    print_info "Results saved in $TMP_DIR/"
}

# Run main
main "$@"