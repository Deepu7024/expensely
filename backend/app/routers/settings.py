from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.models import AppSettings
from app.schemas import MonthlyBudgetInput

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("", response_model=AppSettings)
def get_settings(user: CurrentUser, session: Session = Depends(get_session)):
    """GET /api/settings — app-wide settings not tied to any one bank account (currently just monthlyBudget)."""
    settings = session.exec(select(AppSettings).where(AppSettings.userId == user.id)).first()
    return settings if settings is not None else AppSettings(userId=user.id)


@router.patch("/monthly-budget", response_model=AppSettings)
def update_monthly_budget(payload: MonthlyBudgetInput, user: CurrentUser, session: Session = Depends(get_session)):
    """PATCH /api/settings/monthly-budget — updates only the budget threshold, shared across every bank account."""
    settings = session.exec(select(AppSettings).where(AppSettings.userId == user.id)).first()
    if settings is None:
        settings = AppSettings(userId=user.id)

    settings.monthlyBudget = payload.monthlyBudget

    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings
