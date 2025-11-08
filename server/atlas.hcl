env "local" {
  src = "file://db/schema"
  url = "postgres://postgres:password@localhost:5432/scene-hunter?sslmode=disable"
  dev = "docker://postgres/18/dev"
}

env "docker" {
  src = "file://db/schema"
  url = "postgres://postgres:password@postgres:5432/scene-hunter?sslmode=disable"
  dev = "docker://postgres/18/dev"
}

