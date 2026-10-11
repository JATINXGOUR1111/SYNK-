from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import User, CreatorProfile
from ..schemas import RegisterIn, LoginIn, UpdateMeIn
from ..security import hash_password, verify_password, create_token, get_current_user
from ..ratelimit import auth_limit
from ..serializers import user_me
from ..services.moderation import moderate_text

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201, dependencies=[Depends(auth_limit)])
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(409, "An account with this email already exists.")
    if db.scalar(select(User).where(User.handle == data.handle)):
        raise HTTPException(409, "That handle is taken.")
    mod = moderate_text(f"{data.name} {data.company or ''}")
    if not mod["allowed"]:
        raise HTTPException(422, "That name is not allowed on CreatorMatch.")
    u = User(email=data.email.lower(), name=data.name.strip(), handle=data.handle, role=data.role,
             company=data.company, password_hash=hash_password(data.password))
    db.add(u)
    db.flush()
    if data.role == "creator":
        db.add(CreatorProfile(user_id=u.id))
    db.commit()
    db.refresh(u)
    return {"token": create_token(u.id), "user": user_me(u)}


@router.post("/login", dependencies=[Depends(auth_limit)])
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    return {"token": create_token(u.id), "user": user_me(u)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_me(user)


@router.put("/me")
def update_me(data: UpdateMeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.handle and data.handle != user.handle:
        if db.scalar(select(User).where(User.handle == data.handle)):
            raise HTTPException(409, "That handle is taken.")
        user.handle = data.handle
    for f in ("name", "avatar_url", "banner_url", "company"):
        v = getattr(data, f)
        if v is not None:
            setattr(user, f, v)
    if data.clear_avatar:
        user.avatar_url = None
    if data.clear_banner:
        user.banner_url = None
    db.commit()
    return user_me(user)
