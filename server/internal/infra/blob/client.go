// Package blob provides blob storage client implementations.
package blob

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) domainblob.Blob {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
		return fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

func (c *Client) Put(ctx context.Context, key string, data io.Reader, ttl time.Duration) error {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, data)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// TTLが指定されている場合はヘッダーに設定
	if ttl > 0 {
		req.Header.Set("X-Ttl-Seconds", strconv.FormatInt(int64(ttl.Seconds()), 10))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
		return fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		_ = resp.Body.Close()
		//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
		return nil, fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return resp.Body, nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
		return fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}

	//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
	return false, fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
}

func (c *Client) List(ctx context.Context, prefix string) ([]domainblob.ObjectInfo, error) {
	url := c.baseURL + "/objects"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if prefix != "" {
		q := req.URL.Query()
		q.Add("prefix", prefix)
		req.URL.RawQuery = q.Encode()
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		//nolint:err113 // HTTPステータスコードを含むエラーメッセージが必要
		return nil, fmt.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	type listResponse struct {
		Objects []struct {
			Key          string    `json:"key"`
			Size         int64     `json:"size"`
			LastModified time.Time `json:"lastModified"`
		} `json:"objects"`
	}

	var response listResponse

	err = json.NewDecoder(resp.Body).Decode(&response)
	if err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := make([]domainblob.ObjectInfo, 0, len(response.Objects))
	for _, obj := range response.Objects {
		result = append(result, domainblob.ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			LastModified: obj.LastModified,
		})
	}

	return result, nil
}
