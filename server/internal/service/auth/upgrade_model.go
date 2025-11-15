package auth

import (
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	domainuser "github.com/yashikota/scene-hunter/server/internal/domain/user"
)

// PreparedUpgradeData contains all the data prepared for an upgrade operation.
type PreparedUpgradeData struct {
	// AnonToken is the verified anonymous access token
	AnonToken *domainauth.AnonToken

	// IDToken is the verified Google ID token
	IDToken *GoogleIDToken

	// ExistingIdentity is set if the user already has an account with this Google ID
	ExistingIdentity *domainauth.Identity

	// NewUser is the user to be created (only set if ExistingIdentity is nil)
	NewUser *domainuser.User

	// Identity is the identity to be created (only set if ExistingIdentity is nil)
	Identity *domainauth.Identity
}
