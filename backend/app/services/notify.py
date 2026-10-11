from sqlalchemy.orm import Session
from ..models import Notification, User

TEXT = {
    "like": "{a} liked your post", "comment": "{a} commented on your post", "reply": "{a} replied to your comment",
    "follow": "{a} started following you", "mention": "{a} mentioned you", "new_post": "{a} shared new work",
    "proposal_received": "{a} sent a proposal for your brief", "proposal_accepted": "{a} accepted your proposal",
    "proposal_rejected": "{a} declined your proposal", "milestone": "{a} updated a milestone",
    "brief_match": "A new brief fits your portfolio", "message": "{a} sent you a message",
    "review": "{a} left you a review", "comment_like": "{a} liked your comment", "shortlist": "{a} shortlisted you",
}


def notify(db: Session, user_id: int, type_: str, actor: User | None = None, **ref) -> None:
    if actor is not None and actor.id == user_id:
        return
    text = TEXT.get(type_, type_).format(a=(actor.name if actor else "Someone"))
    db.add(Notification(user_id=user_id, type=type_, actor_id=actor.id if actor else None, text=text[:300],
                        post_id=ref.get("post_id"), proposal_id=ref.get("proposal_id"),
                        brief_id=ref.get("brief_id"), conversation_id=ref.get("conversation_id")))
