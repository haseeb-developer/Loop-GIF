from ..config import settings
from ..models import Gif


def gif_urls(g: Gif) -> dict[str, str | None]:
    """Public URLs for a GIF. The vanity name is used when set; the random id URL always works too."""
    base = settings.public_base_url.rstrip("/")
    name = g.slug or g.public_id
    return {
        "url": f"{base}/g/{name}.gif",
        "permanent_url": f"{base}/g/{g.public_id}.gif",
        "download_url": f"{base}/g/{name}.gif?download=1",
        "poster_url": f"{base}/g/{name}.jpg" if g.storage_key else None,
        "share_path": f"/g/{name}",
    }
