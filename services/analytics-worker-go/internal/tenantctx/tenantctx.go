package tenantctx

import "context"

type contextKey struct{}

// WithTenant stores the tenant that the database connection must be bound to.
func WithTenant(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, contextKey{}, tenantID)
}

// TenantID returns the tenant stored in the context, or an empty string.
func TenantID(ctx context.Context) string {
	tenantID, _ := ctx.Value(contextKey{}).(string)
	return tenantID
}
