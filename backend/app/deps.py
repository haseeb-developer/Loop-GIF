from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import read_session_token

COOKIE = "loop_session"


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    uid = read_session_token(token) if token else None
    user = db.get(User, uid) if uid else None
    if user is None:
        raise HTTPException(401, "Not signed in")
    return user
