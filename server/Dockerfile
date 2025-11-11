### ----------------- ###
### Development image ###
### ----------------- ###
ARG GO_VERSION=1.25@sha256:6ca9eb0b32a4bd4e8c98a4a2edf2d7c96f3ea6db6eb4fc254eef6c067cf73bb4
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS dev

WORKDIR /app

RUN --mount=type=cache,target=/go/pkg/mod/,sharing=locked \
    --mount=type=bind,source=go.sum,target=go.sum \
    --mount=type=bind,source=go.mod,target=go.mod \
    go mod download -x

RUN go install github.com/air-verse/air@v1.63.0 \
    && go install github.com/go-delve/delve/cmd/dlv@v1.25.2

COPY . .

CMD ["air"]

### ---------------- ###
### Production image ###
### ---------------- ###
ARG GO_VERSION=1.25@sha256:6ca9eb0b32a4bd4e8c98a4a2edf2d7c96f3ea6db6eb4fc254eef6c067cf73bb4
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS build

WORKDIR /app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /go/pkg/mod/ to speed up subsequent builds.
# Leverage bind mounts to go.sum and go.mod to avoid having to copy them into the container.
RUN --mount=type=cache,target=/go/pkg/mod/ \
    --mount=type=bind,source=go.sum,target=go.sum \
    --mount=type=bind,source=go.mod,target=go.mod \
    go mod download -x

# This is the architecture you're building for, which is passed in by the builder.
# Placing it here allows the previous steps to be cached across architectures.
ARG TARGETARCH

# Build the application.
# Leverage a cache mount to /go/pkg/mod/ to speed up subsequent builds.
# Leverage a bind mount to the current directory to avoid having to copy the
# source code into the container.
RUN --mount=type=cache,target=/go/pkg/mod/ \
    --mount=type=bind,target=. \
    CGO_ENABLED=0 GOARCH=$TARGETARCH go build -ldflags="-s -w" -trimpath -mod=readonly -o /bin/server ./cmd

### ---------------- ###
### Production image ###
### ---------------- ###
FROM gcr.io/distroless/static-debian13:nonroot@sha256:fedcacdbe5eb1b1ec2ab5f2e7bf2eed246eb371505c43b3c2682ff0c3870e7c3 AS final

# Copy the executable from the "build" stage.
COPY --from=build /bin/server /bin/

WORKDIR /app

# Timezone
ENV TZ=Asia/Tokyo

# What the container should run when it is started.
ENTRYPOINT ["/bin/server"]
