"""Errores de dominio y su traducción uniforme a respuestas HTTP."""


class DomainError(Exception):
    """Error de regla de negocio. Se traduce a una respuesta HTTP consistente."""

    status_code = 400
    code = "domain_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class UnauthorizedError(DomainError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class ValidationDomainError(DomainError):
    status_code = 422
    code = "validation_error"
