from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.api.chat import router as chat_router
from app.api.routes import router
from app.core.config import settings
from app.tools.workspace import ensure_workspace_dirs

app = FastAPI(title="Think9 PULSE")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(chat_router)


@app.on_event("startup")
def on_startup():
    ensure_workspace_dirs()
    store.init_db()


@app.get("/")
def root():
    return {"service": "Think9 PULSE", "status": "ok"}
