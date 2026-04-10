from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get('/health')
def healthcheck() -> dict:
    return {
        'status': 'ok',
        'service': settings.app_name,
        'version': settings.app_version,
    }


@router.get("/ready")
def readiness() -> dict:
    return {"ready": True, "model": settings.ollama_default_model}
