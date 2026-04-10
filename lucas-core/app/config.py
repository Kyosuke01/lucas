from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "LUCAS Core"
    app_version: str = "0.1.0"
    lucas_env: str = "development"
    ollama_base_url: str = "http://ollama:11434"
    ollama_default_model: str = "llama3.2:3b"


settings = Settings()
