from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./creatormatch.db"
    SECRET_KEY: str = "dev-secret-change-me-dev-secret-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"
    VOYAGE_API_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:3000"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 100
    STORAGE_BACKEND: str = "local"  # local | s3
    S3_BUCKET: str = ""
    S3_ENDPOINT: str = ""
    S3_KEY: str = ""
    S3_SECRET: str = ""
    S3_PUBLIC_URL: str = ""
    AUTO_SEED: bool = False
    AI_RATE_LIMIT_PER_MIN: int = 20
    AUTH_RATE_LIMIT_PER_MIN: int = 20
    AI_TIMEOUT_SECONDS: int = 45
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
