package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// GoogleIDToken represents the claims in a Google ID token.
// Google API uses snake_case for JSON field names, so we disable tagliatelle linter.
type GoogleIDToken struct {
	Iss           string `json:"iss"`
	Sub           string `json:"sub"`
	Azp           string `json:"azp"`
	Aud           string `json:"aud"`
	Iat           int64  `json:"iat"`
	Exp           int64  `json:"exp"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Locale        string `json:"locale"`
}

// GoogleTokenResponse represents the response from Google's token endpoint.
// Google API uses snake_case for JSON field names, so we disable tagliatelle linter.
type GoogleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
	IDToken      string `json:"id_token"`
}

// GoogleVerifier handles Google OAuth verification.
type GoogleVerifier struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client
	jwkCache     *jwk.Cache
}

// NewGoogleVerifier creates a new GoogleVerifier.
func NewGoogleVerifier() *GoogleVerifier {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	if clientID == "" {
		panic("GOOGLE_CLIENT_ID environment variable is required")
	}

	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	if clientSecret == "" {
		panic("GOOGLE_CLIENT_SECRET environment variable is required")
	}

	// Create JWK cache for Google's public keys
	jwkCache, err := jwk.NewCache(context.Background(), nil)
	if err != nil {
		panic(fmt.Sprintf("failed to create JWK cache: %v", err))
	}

	// Register Google's JWK endpoint with auto-refresh
	const googleJWKURL = "https://www.googleapis.com/oauth2/v3/certs"

	err = jwkCache.Register(context.Background(), googleJWKURL)
	if err != nil {
		panic(fmt.Sprintf("failed to register JWK cache: %v", err))
	}

	return &GoogleVerifier{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		jwkCache: jwkCache,
	}
}

// ExchangeCodeForToken exchanges an authorization code for tokens.
func (v *GoogleVerifier) ExchangeCodeForToken(
	ctx context.Context,
	code, codeVerifier, redirectURI string,
) (*GoogleTokenResponse, error) {
	tokenURL := "https://oauth2.googleapis.com/token"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, nil)
	if err != nil {
		return nil, errors.Errorf("failed to create request: %w", err)
	}

	query := req.URL.Query()
	query.Add("code", code)
	query.Add("client_id", v.clientID)
	query.Add("client_secret", v.clientSecret)
	query.Add("redirect_uri", redirectURI)
	query.Add("grant_type", "authorization_code")
	query.Add("code_verifier", codeVerifier)
	req.URL.RawQuery = query.Encode()

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, errors.Errorf("failed to exchange code: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)

		return nil, errors.Errorf("token exchange failed: %s", string(body))
	}

	var tokenResp GoogleTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, errors.Errorf("failed to decode token response: %w", err)
	}

	return &tokenResp, nil
}

// VerifyIDToken verifies a Google ID token using Google's JWK.
func (v *GoogleVerifier) VerifyIDToken(
	ctx context.Context,
	idToken string,
) (*GoogleIDToken, error) {
	const googleJWKURL = "https://www.googleapis.com/oauth2/v3/certs"

	// Fetch the JWK set from cache
	jwkSet, err := v.jwkCache.Lookup(ctx, googleJWKURL)
	if err != nil {
		return nil, errors.Errorf("failed to fetch JWK set: %w", err)
	}

	// Parse and verify the JWT
	token, err := jwt.Parse(
		[]byte(idToken),
		jwt.WithKeySet(jwkSet),
		jwt.WithValidate(true),
		jwt.WithAudience(v.clientID),
	)
	if err != nil {
		return nil, errors.Errorf("failed to verify ID token: %w", err)
	}

	// Verify issuer (accept both Google issuer formats)
	issuer, issuerOK := token.Issuer()
	if !issuerOK {
		return nil, errors.Errorf("missing issuer")
	}

	if issuer != "https://accounts.google.com" && issuer != "accounts.google.com" {
		return nil, errors.Errorf("invalid issuer: %s", issuer)
	}

	// Extract standard claims
	sub, ok := token.Subject()
	if !ok || sub == "" {
		return nil, errors.Errorf("missing subject")
	}

	// Extract custom claims
	var email string
	if err := token.Get("email", &email); err == nil {
		// Got email
	}

	var emailVerified bool
	if err := token.Get("email_verified", &emailVerified); err == nil {
		// Got emailVerified
	}

	var name string
	if err := token.Get("name", &name); err == nil {
		// Got name
	}

	var picture string
	if err := token.Get("picture", &picture); err == nil {
		// Got picture
	}

	var givenName string
	if err := token.Get("given_name", &givenName); err == nil {
		// Got givenName
	}

	var familyName string
	if err := token.Get("family_name", &familyName); err == nil {
		// Got familyName
	}

	var locale string
	if err := token.Get("locale", &locale); err == nil {
		// Got locale
	}

	var azp string
	if err := token.Get("azp", &azp); err == nil {
		// Got azp
	}

	// Get issuer and audience
	iss, _ := token.Issuer()
	aud, _ := token.Audience()

	audStr := ""
	if len(aud) > 0 {
		audStr = aud[0]
	}

	iat, _ := token.IssuedAt()
	exp, _ := token.Expiration()

	return &GoogleIDToken{
		Iss:           iss,
		Sub:           sub,
		Azp:           azp,
		Aud:           audStr,
		Iat:           iat.Unix(),
		Exp:           exp.Unix(),
		Email:         email,
		EmailVerified: emailVerified,
		Name:          name,
		Picture:       picture,
		GivenName:     givenName,
		FamilyName:    familyName,
		Locale:        locale,
	}, nil
}

// GetUserInfo retrieves user info from Google using an access token.
func (v *GoogleVerifier) GetUserInfo(
	ctx context.Context,
	accessToken string,
) (map[string]any, error) {
	userInfoURL := "https://www.googleapis.com/oauth2/v2/userinfo"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userInfoURL, nil)
	if err != nil {
		return nil, errors.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, errors.Errorf("failed to get user info: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)

		return nil, errors.Errorf("get user info failed: %s", string(body))
	}

	var userInfo map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, errors.Errorf("failed to decode user info: %w", err)
	}

	return userInfo, nil
}
