from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import COOKIE, current_user
from ..models import Gif, User
from ..ratelimit import client_ip, limiter
from ..schemas import LoginIn, SignupIn, UserOut
from ..security import create_session_token, hash_password, verify_password
from ..services.sources import used_bytes

router = APIRouter(prefix="/api/auth", tags=["auth"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


def _set_cookie(resp: Response, user_id: int) -> None:
    resp.set_cookie(COOKIE, create_session_token(user_id), max_age=settings.session_days * 86400,
                    httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")


def _user_out(db: Session, user: User) -> UserOut:
    count, total = db.execute(
        select(func.count(Gif.id), func.coalesce(func.sum(Gif.size_bytes), 0)).where(Gif.user_id == user.id)
    ).one()
    return UserOut(email=user.email, display_name=user.display_name, created_at=user.created_at,
                   gif_count=int(count or 0), storage_bytes=int(total or 0), source_bytes=used_bytes(db, user.id),
                   source_quota_bytes=settings.source_quota_bytes)


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: DbSession):
    limiter.check(f"signup:{client_ip(request)}", settings.signup_limit_per_hour, 3600)
    user = User(email=body.email.lower().strip(), display_name=body.display_name.strip(),
                password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.") from None
    _set_cookie(response, user.id)
    return _user_out(db, user)


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DbSession):
    email = body.email.lower().strip()
    limiter.check(f"login-ip:{client_ip(request)}", settings.login_limit_per_15min, 900)
    limiter.check(f"login-email:{email}", settings.login_limit_per_15min, 900)
    user = db.scalar(select(User).where(User.email == email))
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        raise HTTPException(401, "Email or password is incorrect.")
    _set_cookie(response, user.id)
    return _user_out(db, user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, db: DbSession):
    return _user_out(db, user)
