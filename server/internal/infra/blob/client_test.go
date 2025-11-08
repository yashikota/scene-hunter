package blob_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
)

// TestClient_Ping はBlobサーバーへの疎通確認が正常に動作することをテストする.
func TestClient_Ping(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		statusCode int
		wantErr    bool
	}{
		{
			name:       "success", // 正常応答
			statusCode: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "service unavailable", // サービス利用不可
			statusCode: http.StatusServiceUnavailable,
			wantErr:    true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
					w.WriteHeader(testCase.statusCode)
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			err := client.Ping(context.Background())

			if (err != nil) != testCase.wantErr {
				t.Errorf("Ping() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

// TestClient_Put はオブジェクトのアップロードが正常に動作することをテストする.
// TTLあり・なし、エラーケースなど様々な状況を検証する.
func TestClient_Put(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		key        string
		data       string
		ttl        time.Duration
		statusCode int
		wantErr    bool
		checkTTL   bool
	}{
		{
			name:       "success without ttl", // TTLなしで成功
			key:        "test.txt",
			data:       "hello world",
			ttl:        0,
			statusCode: http.StatusOK,
			wantErr:    false,
			checkTTL:   false,
		},
		{
			name:       "success with ttl", // TTL付きで成功
			key:        "temp.txt",
			data:       "temporary data",
			ttl:        1 * time.Hour,
			statusCode: http.StatusCreated,
			wantErr:    false,
			checkTTL:   true,
		},
		{
			name:       "server error", // サーバーエラー
			key:        "error.txt",
			data:       "data",
			ttl:        0,
			statusCode: http.StatusInternalServerError,
			wantErr:    true,
			checkTTL:   false,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
					if req.Method != http.MethodPut {
						t.Errorf("expected PUT, got %s", req.Method)
					}

					expectedPath := "/objects/" + testCase.key
					if req.URL.Path != expectedPath {
						t.Errorf("expected path %s, got %s", expectedPath, req.URL.Path)
					}

					if testCase.checkTTL {
						ttlHeader := req.Header.Get("X-Ttl-Seconds")
						if ttlHeader == "" {
							t.Error("expected X-TTL-Seconds header, got none")
						}
					}

					body, _ := io.ReadAll(req.Body)
					if string(body) != testCase.data {
						t.Errorf("expected body %s, got %s", testCase.data, string(body))
					}

					writer.WriteHeader(testCase.statusCode)
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			err := client.Put(
				context.Background(),
				testCase.key,
				strings.NewReader(testCase.data),
				testCase.ttl,
			)

			if (err != nil) != testCase.wantErr {
				t.Errorf("Put() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

// TestClient_Get はオブジェクトのダウンロードが正常に動作することをテストする.
func TestClient_Get(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		key        string
		statusCode int
		response   string
		wantErr    bool
	}{
		{
			name:       "success", // 正常にオブジェクトを取得
			key:        "test.txt",
			statusCode: http.StatusOK,
			response:   "file contents",
			wantErr:    false,
		},
		{
			name:       "not found", // オブジェクトが存在しない
			key:        "missing.txt",
			statusCode: http.StatusNotFound,
			response:   "",
			wantErr:    true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
					if req.Method != http.MethodGet {
						t.Errorf("expected GET, got %s", req.Method)
					}

					expectedPath := "/objects/" + testCase.key
					if req.URL.Path != expectedPath {
						t.Errorf("expected path %s, got %s", expectedPath, req.URL.Path)
					}

					writer.WriteHeader(testCase.statusCode)

					if testCase.statusCode == http.StatusOK {
						_, _ = writer.Write([]byte(testCase.response))
					}
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			reader, err := client.Get(context.Background(), testCase.key)

			if (err != nil) != testCase.wantErr {
				t.Errorf("Get() error = %v, wantErr %v", err, testCase.wantErr)

				return
			}

			if err == nil {
				defer func() {
					_ = reader.Close()
				}()

				body, _ := io.ReadAll(reader)
				if string(body) != testCase.response {
					t.Errorf("Get() body = %s, want %s", string(body), testCase.response)
				}
			}
		})
	}
}

// TestClient_Delete はオブジェクトの削除が正常に動作することをテストする.
// 200/204ステータスでの成功ケースと、404エラーケースを検証する.
func TestClient_Delete(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		key        string
		statusCode int
		wantErr    bool
	}{
		{
			name:       "success with 200", // 200で削除成功
			key:        "test.txt",
			statusCode: http.StatusOK,
			wantErr:    false,
		},
		{
			name:       "success with 204", // 204で削除成功
			key:        "test.txt",
			statusCode: http.StatusNoContent,
			wantErr:    false,
		},
		{
			name:       "not found", // オブジェクトが見つからない
			key:        "missing.txt",
			statusCode: http.StatusNotFound,
			wantErr:    true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
					if req.Method != http.MethodDelete {
						t.Errorf("expected DELETE, got %s", req.Method)
					}

					expectedPath := "/objects/" + testCase.key
					if req.URL.Path != expectedPath {
						t.Errorf("expected path %s, got %s", expectedPath, req.URL.Path)
					}

					writer.WriteHeader(testCase.statusCode)
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			err := client.Delete(context.Background(), testCase.key)

			if (err != nil) != testCase.wantErr {
				t.Errorf("Delete() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

// TestClient_Exists はオブジェクトの存在確認が正常に動作することをテストする.
func TestClient_Exists(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		key        string
		statusCode int
		want       bool
		wantErr    bool
	}{
		{
			name:       "exists", // オブジェクトが存在する
			key:        "test.txt",
			statusCode: http.StatusOK,
			want:       true,
			wantErr:    false,
		},
		{
			name:       "not found", // オブジェクトが存在しない
			key:        "missing.txt",
			statusCode: http.StatusNotFound,
			want:       false,
			wantErr:    false,
		},
		{
			name:       "server error", // サーバーエラー
			key:        "error.txt",
			statusCode: http.StatusInternalServerError,
			want:       false,
			wantErr:    true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
					if req.Method != http.MethodHead {
						t.Errorf("expected HEAD, got %s", req.Method)
					}

					expectedPath := "/objects/" + testCase.key
					if req.URL.Path != expectedPath {
						t.Errorf("expected path %s, got %s", expectedPath, req.URL.Path)
					}

					writer.WriteHeader(testCase.statusCode)
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			exists, err := client.Exists(context.Background(), testCase.key)

			if (err != nil) != testCase.wantErr {
				t.Errorf("Exists() error = %v, wantErr %v", err, testCase.wantErr)

				return
			}

			if exists != testCase.want {
				t.Errorf("Exists() = %v, want %v", exists, testCase.want)
			}
		})
	}
}

// TestClient_List はオブジェクトのリスト取得が正常に動作することをテストする.
// プレフィックスによるフィルタリング、空の結果、エラーケースなどを検証する.
func TestClient_List(t *testing.T) { //nolint:gocognit // テストケースが多いため許容
	t.Parallel()

	tests := []struct {
		name       string
		prefix     string
		statusCode int
		response   string
		wantLen    int
		wantErr    bool
	}{
		{
			name:       "success with results", // 複数の結果を取得
			prefix:     "test/",
			statusCode: http.StatusOK,
			response: `{
				"objects": [
					{"key": "test/file1.txt", "size": 100, "lastModified": "2024-01-01T00:00:00Z"},
					{"key": "test/file2.txt", "size": 200, "lastModified": "2024-01-02T00:00:00Z"}
				]
			}`,
			wantLen: 2,
			wantErr: false,
		},
		{
			name:       "success with empty results", // 空の結果
			prefix:     "empty/",
			statusCode: http.StatusOK,
			response:   `{"objects": []}`,
			wantLen:    0,
			wantErr:    false,
		},
		{
			name:       "no prefix", // プレフィックスなしで全取得
			prefix:     "",
			statusCode: http.StatusOK,
			response: `{
				"objects": [
					{"key": "file.txt", "size": 50, "lastModified": "2024-01-01T00:00:00Z"}
				]
			}`,
			wantLen: 1,
			wantErr: false,
		},
		{
			name:       "server error", // サーバーエラー
			prefix:     "error/",
			statusCode: http.StatusInternalServerError,
			response:   "",
			wantLen:    0,
			wantErr:    true,
		},
		{
			name:       "invalid json", // 無効なJSONレスポンス
			prefix:     "invalid/",
			statusCode: http.StatusOK,
			response:   `{invalid json}`,
			wantLen:    0,
			wantErr:    true,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(
				http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
					if req.Method != http.MethodGet {
						t.Errorf("expected GET, got %s", req.Method)
					}

					if req.URL.Path != "/objects" {
						t.Errorf("expected path /objects, got %s", req.URL.Path)
					}

					if testCase.prefix != "" {
						prefix := req.URL.Query().Get("prefix")
						if prefix != testCase.prefix {
							t.Errorf("expected prefix %s, got %s", testCase.prefix, prefix)
						}
					}

					writer.WriteHeader(testCase.statusCode)

					if testCase.response != "" {
						_, _ = writer.Write([]byte(testCase.response))
					}
				}),
			)
			defer server.Close()

			client := blob.NewClient(server.URL)
			objects, err := client.List(context.Background(), testCase.prefix)

			if (err != nil) != testCase.wantErr {
				t.Errorf("List() error = %v, wantErr %v", err, testCase.wantErr)

				return
			}

			if len(objects) != testCase.wantLen {
				t.Errorf("List() returned %d objects, want %d", len(objects), testCase.wantLen)
			}

			// 正常系の場合は各フィールドの検証
			if !testCase.wantErr && testCase.wantLen > 0 {
				for _, obj := range objects {
					if obj.Key == "" {
						t.Error("List() object has empty Key")
					}

					if obj.Size < 0 {
						t.Errorf("List() object has negative Size: %d", obj.Size)
					}
				}
			}
		})
	}
}

// TestNewClient はBlobクライアントが正常に作成できることをテストする.
func TestNewClient(t *testing.T) {
	t.Parallel()

	baseURL := "http://localhost:9000"
	client := blob.NewClient(baseURL)

	if client == nil {
		t.Error("NewClient() returned nil")
	}
}
