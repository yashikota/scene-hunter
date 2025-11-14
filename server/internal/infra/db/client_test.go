package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
)

// setupPostgres はテスト用のPostgreSQLコンテナをセットアップする.
func setupPostgres(ctx context.Context, t *testing.T) (string, func()) {
	t.Helper()

	pgContainer, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("testuser"),
		postgres.WithPassword("testpass"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}

	connString, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	cleanup := func() {
		err := pgContainer.Terminate(ctx)
		if err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return connString, cleanup
}

// TestNewClient はPostgreSQLクライアントが正常に作成できることをテストする.
func TestNewClient(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v, want nil", err)
	}

	if client == nil {
		t.Error("NewClient() returned nil")
	}

	err = client.Close()
	if err != nil {
		t.Errorf("Close() error = %v, want nil", err)
	}
}

// TestNewClient_InvalidConnectionString は無効な接続文字列でエラーが返されることをテストする.
func TestNewClient_InvalidConnectionString(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	_, err := db.NewClient(ctx, "invalid connection string")
	if err == nil {
		t.Error("NewClient() with invalid connection string should return error")
	}
}

// TestClient_Ping はPostgreSQLサーバーへの疎通確認が成功することをテストする.
func TestClient_Ping(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	err = client.Ping(ctx)
	if err != nil {
		t.Errorf("Ping() error = %v, want nil", err)
	}
}

// TestClient_Exec はSQL実行（テーブル作成・データ挿入）が正常に動作することをテストする.
func TestClient_Exec(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Create table
	err = client.Exec(ctx, `
		CREATE TABLE test_users (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			email VARCHAR(100) UNIQUE NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	// Insert data
	err = client.Exec(ctx,
		"INSERT INTO test_users (name, email) VALUES ($1, $2)",
		"John Doe", "john@example.com",
	)
	if err != nil {
		t.Errorf("Exec() insert error = %v, want nil", err)
	}
}

// TestClient_Query は複数行を返すクエリが正常に動作することをテストする.
// テーブルを作成してデータを挿入し、それらを取得して検証する.
func TestClient_Query(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Setup test data
	err = client.Exec(ctx, `
		CREATE TABLE test_products (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			price INTEGER NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	err = client.Exec(ctx,
		"INSERT INTO test_products (name, price) VALUES ($1, $2), ($3, $4)",
		"Product A", 100, "Product B", 200,
	)
	if err != nil {
		t.Fatalf("Exec() insert error = %v", err)
	}

	// Query data
	rows, err := client.Query(ctx, "SELECT id, name, price FROM test_products ORDER BY id")
	if err != nil {
		t.Fatalf("Query() error = %v", err)
	}
	defer rows.Close()

	count := 0

	for rows.Next() {
		var (
			id, price int
			name      string
		)

		err = rows.Scan(&id, &name, &price)
		if err != nil {
			t.Errorf("Scan() error = %v", err)

			continue
		}

		count++

		switch count {
		case 1:
			if name != "Product A" || price != 100 {
				t.Errorf(
					"First row: got name=%s, price=%d; want name=Product A, price=100",
					name,
					price,
				)
			}
		case 2:
			if name != "Product B" || price != 200 {
				t.Errorf(
					"Second row: got name=%s, price=%d; want name=Product B, price=200",
					name,
					price,
				)
			}
		}
	}

	err = rows.Err()
	if err != nil {
		t.Errorf("rows.Err() = %v, want nil", err)
	}

	if count != 2 {
		t.Errorf("Query() returned %d rows, want 2", count)
	}
}

// TestClient_QueryRow は単一行を返すクエリが正常に動作することをテストする.
func TestClient_QueryRow(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Setup test data
	err = client.Exec(ctx, `
		CREATE TABLE test_settings (
			key VARCHAR(100) PRIMARY KEY,
			value TEXT NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	err = client.Exec(ctx,
		"INSERT INTO test_settings (key, value) VALUES ($1, $2)",
		"app_name", "TestApp",
	)
	if err != nil {
		t.Fatalf("Exec() insert error = %v", err)
	}

	// Query single row
	row := client.QueryRow(ctx, "SELECT value FROM test_settings WHERE key = $1", "app_name")

	var value string

	err = row.Scan(&value)
	if err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	if value != "TestApp" {
		t.Errorf("QueryRow() value = %s, want TestApp", value)
	}
}

// TestClient_QueryRow_NotFound は存在しない行を取得した際にエラーが返されることをテストする.
func TestClient_QueryRow_NotFound(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Query non-existent row
	row := client.QueryRow(
		ctx,
		"SELECT 1 FROM pg_tables WHERE tablename = $1",
		"non_existent_table",
	)

	var result int

	err = row.Scan(&result)
	if err == nil {
		t.Error("Scan() on non-existent row should return error")
	}
}

// TestClient_Transaction_Commit はトランザクションのコミットが正常に動作することをテストする.
// 複数のSQL実行をトランザクション内で行い、コミット後に変更が反映されることを確認する.
func TestClient_Transaction_Commit(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Setup test data
	err = client.Exec(ctx, `
		CREATE TABLE test_accounts (
			id SERIAL PRIMARY KEY,
			balance INTEGER NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	err = client.Exec(ctx,
		"INSERT INTO test_accounts (balance) VALUES ($1), ($2)",
		1000, 2000,
	)
	if err != nil {
		t.Fatalf("Exec() insert error = %v", err)
	}

	// Begin transaction
	transaction, err := client.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}

	// Transfer money
	_, err = transaction.Exec(
		ctx,
		"UPDATE test_accounts SET balance = balance - $1 WHERE id = $2",
		500,
		1,
	)
	if err != nil {
		t.Fatalf("Exec() in transaction error = %v", err)
	}

	_, err = transaction.Exec(
		ctx,
		"UPDATE test_accounts SET balance = balance + $1 WHERE id = $2",
		500,
		2,
	)
	if err != nil {
		t.Fatalf("Exec() in transaction error = %v", err)
	}

	// Commit transaction
	err = transaction.Commit(ctx)
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}

	// Verify balances after commit
	row := client.QueryRow(ctx, "SELECT balance FROM test_accounts WHERE id = $1", 1)

	var balance1 int

	err = row.Scan(&balance1)
	if err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	if balance1 != 500 {
		t.Errorf("Account 1 balance = %d, want 500", balance1)
	}

	row = client.QueryRow(ctx, "SELECT balance FROM test_accounts WHERE id = $1", 2)

	var balance2 int

	err = row.Scan(&balance2)
	if err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	if balance2 != 2500 {
		t.Errorf("Account 2 balance = %d, want 2500", balance2)
	}
}

// TestClient_Transaction_Rollback はトランザクションのロールバックが正常に動作することをテストする.
// トランザクション内でデータを変更後、ロールバックすることで変更が取り消されることを確認する.
func TestClient_Transaction_Rollback(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Setup test data
	err = client.Exec(ctx, `
		CREATE TABLE test_balances (
			id SERIAL PRIMARY KEY,
			amount INTEGER NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	err = client.Exec(ctx,
		"INSERT INTO test_balances (amount) VALUES ($1)",
		1000,
	)
	if err != nil {
		t.Fatalf("Exec() insert error = %v", err)
	}

	// Begin transaction
	transaction, err := client.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}

	// Update within transaction
	_, err = transaction.Exec(ctx, "UPDATE test_balances SET amount = $1 WHERE id = $2", 5000, 1)
	if err != nil {
		t.Fatalf("Exec() in transaction error = %v", err)
	}

	// Rollback transaction
	err = transaction.Rollback(ctx)
	if err != nil {
		t.Fatalf("Rollback() error = %v", err)
	}

	// Verify amount is unchanged after rollback
	row := client.QueryRow(ctx, "SELECT amount FROM test_balances WHERE id = $1", 1)

	var amount int

	err = row.Scan(&amount)
	if err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	if amount != 1000 {
		t.Errorf("Amount = %d, want 1000 (should be rolled back)", amount)
	}
}

// TestClient_Transaction_Query はトランザクション内でのクエリ実行が正常に動作することをテストする.
func TestClient_Transaction_Query(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	connString, cleanup := setupPostgres(ctx, t)
	defer cleanup()

	client, err := db.NewClient(ctx, connString)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	defer func() {
		_ = client.Close()
	}()

	// Setup test data
	err = client.Exec(ctx, `
		CREATE TABLE test_items (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Exec() create table error = %v", err)
	}

	// Begin transaction
	transaction, err := client.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}

	// Insert and query within transaction
	_, err = transaction.Exec(ctx, "INSERT INTO test_items (name) VALUES ($1)", "Item 1")
	if err != nil {
		t.Fatalf("Exec() in transaction error = %v", err)
	}

	rows, err := transaction.Query(ctx, "SELECT name FROM test_items")
	if err != nil {
		t.Fatalf("Query() in transaction error = %v", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
	}

	if count != 1 {
		t.Errorf("Query() in transaction returned %d rows, want 1", count)
	}

	err = transaction.Commit(ctx)
	if err != nil {
		t.Fatalf("Commit() error = %v", err)
	}
}
