from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.infrastructure.database import Base

# Importar todos los modelos para que Alembic los detecte.
from app.modules.appointments import models as _appointments  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.availability import models as _availability  # noqa: F401
from app.modules.businesses import models as _businesses  # noqa: F401
from app.modules.conversations import models as _conversations  # noqa: F401
from app.modules.patients import models as _patients  # noqa: F401
from app.modules.services import models as _services  # noqa: F401
from app.shared import audit as _audit  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
