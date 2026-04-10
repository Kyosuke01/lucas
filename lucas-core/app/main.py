from fastapi import FastAPI
from app.api.routes.health import router as health_router
from app.config import settings

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(health_router, prefix='/api')

@app.get('/')
def root() -> dict:
    return {'message': 'LUCAS Core is running', 'docs': '/docs', 'health': '/api/health'}