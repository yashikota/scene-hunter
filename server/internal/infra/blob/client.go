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

	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

const defaultTimeout = 5 * time.Second

type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new Client with the specified baseURL and timeout.
// If timeout is 0, the defaultTimeout is used.
func NewClient(baseURL string, timeout time.Duration) Blob {
	if timeout == 0 {
		timeout = defaultTimeout
	}

	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return errors.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return errors.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

// Check implements health.Checker interface.
func (c *Client) Check(ctx context.Context) error {
	err := c.Ping(ctx)
	if err != nil {
		return errors.Errorf("rustfs ping failed: %w", err)
	}

	return nil
}

// Name implements health.Checker interface.
func (c *Client) Name() string {
	return "rustfs"
}

func (c *Client) Put(ctx context.Context, key string, data io.Reader, ttl time.Duration) error {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, data)
	if err != nil {
		return errors.Errorf("failed to create request: %w", err)
	}

	// TTLが指定されている場合はヘッダーに設定
	if ttl > 0 {
		req.Header.Set("X-Ttl-Seconds", strconv.FormatInt(int64(ttl.Seconds()), 10))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return errors.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, errors.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, errors.Errorf("failed to send request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		_ = resp.Body.Close()

		return nil, errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return resp.Body, nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return errors.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return errors.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
	}

	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	url := fmt.Sprintf("%s/objects/%s", c.baseURL, key)

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return false, errors.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, errors.Errorf("failed to send request: %w", err)
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

	return false, errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
}

func (c *Client) List(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	url := c.baseURL + "/objects"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, errors.Errorf("failed to create request: %w", err)
	}

	if prefix != "" {
		q := req.URL.Query()
		q.Add("prefix", prefix)
		req.URL.RawQuery = q.Encode()
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, errors.Errorf("failed to send request: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.Errorf("unexpected status code: %d: %s", resp.StatusCode, resp.Status)
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
		return nil, errors.Errorf("failed to decode response: %w", err)
	}

	result := make([]ObjectInfo, 0, len(response.Objects))
	for _, obj := range response.Objects {
		result = append(result, ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			LastModified: obj.LastModified,
		})
	}

	return result, nil
}
