locals {
  db_pass = getenv("POSTGRES_PASSWORD")
}

env "local" {
  src = "file://db/schema"
  url = "postgres://postgres:${local.db_pass}@localhost:5432/scene-hunter?sslmode=disable"
  dev = "docker://postgres/18/dev"
}

env "docker" {
  src = "file://db/schema"
  url = "postgres://postgres:${local.db_pass}@postgres:5432/scene-hunter?sslmode=disable"
  dev = "docker://postgres/18/dev"
}
