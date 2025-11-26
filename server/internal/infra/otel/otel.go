// Package otel provides OpenTelemetry initialization and configuration.
package otel

import (
	"context"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Config holds OpenTelemetry configuration.
type Config struct {
	ServiceName    string
	ServiceVersion string
	Endpoint       string // OTLP endpoint (e.g., "localhost:4317")
	Insecure       bool   // Use insecure connection (no TLS)
}

// Provider holds OpenTelemetry providers for cleanup.
type Provider struct {
	TracerProvider *sdktrace.TracerProvider
	MeterProvider  *sdkmetric.MeterProvider
}

// Shutdown gracefully shuts down the OpenTelemetry providers.
func (p *Provider) Shutdown(ctx context.Context) error {
	var errs []error

	if p.TracerProvider != nil {
		if err := p.TracerProvider.Shutdown(ctx); err != nil {
			errs = append(errs, errors.Errorf("failed to shutdown tracer provider: %w", err))
		}
	}

	if p.MeterProvider != nil {
		if err := p.MeterProvider.Shutdown(ctx); err != nil {
			errs = append(errs, errors.Errorf("failed to shutdown meter provider: %w", err))
		}
	}

	if len(errs) > 0 {
		return errors.Errorf("shutdown errors: %v", errs)
	}

	return nil
}

// Init initializes OpenTelemetry with the given configuration.
func Init(ctx context.Context, cfg Config) (*Provider, error) {
	res, err := newResource(cfg)
	if err != nil {
		return nil, errors.Errorf("failed to create resource: %w", err)
	}

	tracerProvider, err := newTracerProvider(ctx, cfg, res)
	if err != nil {
		return nil, errors.Errorf("failed to create tracer provider: %w", err)
	}

	meterProvider, err := newMeterProvider(ctx, cfg, res)
	if err != nil {
		// Cleanup tracer provider on error
		_ = tracerProvider.Shutdown(ctx)

		return nil, errors.Errorf("failed to create meter provider: %w", err)
	}

	// Set global providers
	otel.SetTracerProvider(tracerProvider)
	otel.SetMeterProvider(meterProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &Provider{
		TracerProvider: tracerProvider,
		MeterProvider:  meterProvider,
	}, nil
}

func newResource(cfg Config) (*resource.Resource, error) {
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
		),
	)
	if err != nil {
		return nil, errors.Errorf("failed to merge resource: %w", err)
	}

	return res, nil
}

func newTracerProvider(
	ctx context.Context,
	cfg Config,
	res *resource.Resource,
) (*sdktrace.TracerProvider, error) {
	opts := []otlptracegrpc.Option{
		otlptracegrpc.WithEndpoint(cfg.Endpoint),
	}

	if cfg.Insecure {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}

	exporter, err := otlptracegrpc.New(ctx, opts...)
	if err != nil {
		return nil, errors.Errorf("failed to create trace exporter: %w", err)
	}

	return sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
		),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	), nil
}

func newMeterProvider(
	ctx context.Context,
	cfg Config,
	res *resource.Resource,
) (*sdkmetric.MeterProvider, error) {
	opts := []otlpmetricgrpc.Option{
		otlpmetricgrpc.WithEndpoint(cfg.Endpoint),
	}

	if cfg.Insecure {
		opts = append(opts, otlpmetricgrpc.WithInsecure())
	}

	exporter, err := otlpmetricgrpc.New(ctx, opts...)
	if err != nil {
		return nil, errors.Errorf("failed to create metric exporter: %w", err)
	}

	return sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter,
			sdkmetric.WithInterval(30*time.Second),
		)),
		sdkmetric.WithResource(res),
	), nil
}
