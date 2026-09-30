"""The MVP permission catalog and system roles (Phase-1 'example catalog', demonstrative — not the final RBAC model)."""

PERMISSIONS: list[tuple[str, str, str]] = [
    # key, domain, description
    ("dashboard.read", "Platform", "View the platform dashboard."),
    ("institution.read", "Institutions", "View institutions and their details."),
    ("institution.create", "Institutions", "Create institutions."),
    ("institution.update", "Institutions", "Edit institution details."),
    ("institution.suspend", "Institutions", "Suspend or reactivate institutions."),
    ("user.read", "Users", "View users across institutions."),
    ("user.update", "Users", "Edit user records."),
    ("user.deactivate", "Users", "Activate or deactivate users."),
    ("admin.read", "Administrators", "View platform administrators."),
    ("admin.create", "Administrators", "Invite new platform administrators."),
    ("admin.update", "Administrators", "Change administrator status and roles."),
    ("role.read", "Roles", "View roles and the permission catalog."),
    ("role.create", "Roles", "Create and edit roles."),
    ("role.assign", "Roles", "Assign roles to administrators."),
    ("audit.read", "Audit", "View the platform activity log."),
    ("settings.read", "Settings", "View platform settings."),
    ("settings.update", "Settings", "Change platform settings."),
]

SYSTEM_ROLES: dict[str, list[str]] = {
    "Platform Owner": [key for key, _, _ in PERMISSIONS],
    "Operations Admin": [
        "dashboard.read",
        "institution.read",
        "institution.create",
        "institution.update",
        "institution.suspend",
        "user.read",
        "user.update",
        "user.deactivate",
        "admin.read",
        "admin.create",
        "admin.update",
        "audit.read",
        "settings.read",
        "role.read",
    ],
    "Support Admin": [
        "dashboard.read",
        "institution.read",
        "user.read",
        "user.deactivate",
        "audit.read",
    ],
    "Read-only Auditor": [
        "dashboard.read",
        "institution.read",
        "user.read",
        "admin.read",
        "role.read",
        "audit.read",
        "settings.read",
    ],
}

ROLE_DESCRIPTIONS: dict[str, str] = {
    "Platform Owner": "Full platform control, including administrator management and settings.",
    "Operations Admin": "Runs day-to-day institution and user operations.",
    "Support Admin": "Investigates issues and deactivates compromised accounts. Read-mostly.",
    "Read-only Auditor": "Read access across the platform for review and compliance.",
}
