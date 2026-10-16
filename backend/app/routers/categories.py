from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import CurrentUser
from app.database import get_session
from app.models import CategoryOption, Transaction
from app.schemas import CategoryInput, CategoryRenameInput

router = APIRouter(prefix="/categories", tags=["categories"])

# The built-in catch-all every deleted category's transactions fall back to
# (same idea as the default Cash bank account) — can't itself be
# renamed or deleted, since there'd be nothing left to fall back to.
FALLBACK_CATEGORY = "Other"


@router.get("", response_model=list[str])
def list_categories(user: CurrentUser, session: Session = Depends(get_session)):
    """GET /api/categories — every category name available in the pickers and the mail-sync prompt."""
    rows = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user.id).order_by(CategoryOption.createdAt)
    ).all()
    return [row.name for row in rows]


@router.post("", response_model=str, status_code=201)
def add_category(payload: CategoryInput, user: CurrentUser, session: Session = Depends(get_session)):
    """POST /api/categories — register a new category name. A duplicate (case-sensitive) is a no-op, not an error."""
    name = payload.name.strip()
    existing = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user.id, CategoryOption.name == name)
    ).first()
    if existing is not None:
        return existing.name

    session.add(
        CategoryOption(
            userId=user.id, name=name,
            createdAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        )
    )
    session.commit()
    return name


@router.patch("/{name}", response_model=str)
def rename_category(name: str, payload: CategoryRenameInput, user: CurrentUser, session: Session = Depends(get_session)):
    """
    PATCH /api/categories/{name} — rename a category. Every transaction
    currently using it is updated to the new name. If the new name
    already exists, the two merge: this category's transactions move onto
    the existing one and this row is removed, rather than erroring.
    """
    if name == FALLBACK_CATEGORY:
        raise HTTPException(status_code=400, detail=f"Can't rename the built-in {FALLBACK_CATEGORY} category.")

    category = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user.id, CategoryOption.name == name)
    ).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    new_name = payload.name.strip()
    if new_name == name:
        return name

    existing = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user.id, CategoryOption.name == new_name)
    ).first()

    for tx in session.exec(
        select(Transaction).where(Transaction.userId == user.id, Transaction.category == name)
    ).all():
        tx.category = new_name
        session.add(tx)

    if existing is None:
        category.name = new_name
        session.add(category)
    else:
        session.delete(category)

    session.commit()
    return new_name


@router.delete("/{name}", status_code=204)
def delete_category(name: str, user: CurrentUser, session: Session = Depends(get_session)):
    """
    DELETE /api/categories/{name} — remove a category. Any transaction
    using it is reassigned to the built-in Other category rather than
    orphaned. The Other category itself can't be deleted.
    """
    if name == FALLBACK_CATEGORY:
        raise HTTPException(status_code=400, detail=f"Can't delete the built-in {FALLBACK_CATEGORY} category.")

    category = session.exec(
        select(CategoryOption).where(CategoryOption.userId == user.id, CategoryOption.name == name)
    ).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    for tx in session.exec(
        select(Transaction).where(Transaction.userId == user.id, Transaction.category == name)
    ).all():
        tx.category = FALLBACK_CATEGORY
        session.add(tx)

    session.delete(category)
    session.commit()
