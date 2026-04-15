from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    allowed_origins: str = "http://localhost:5173"

    # Chat / Anamnese
    anthropic_api_key: str = ""
    anamnese_agent_id: str = ""
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""
    supabase_chats_bucket: str = "chats"
    supabase_assessments_bucket: str = "assessments"
    supabase_feedbacks_bucket: str = "session-feedbacks"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()  # type: ignore[call-arg]
