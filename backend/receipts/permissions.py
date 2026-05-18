"""Receipt access — fee collection staff can print; template design needs receipt_templates."""
from rest_framework.exceptions import PermissionDenied

from schools.module_permissions import has_module_permission, is_owner


def assert_can_print_receipt(user) -> None:
    if is_owner(user):
        return
    if has_module_permission(user, 'fee_collection', 'view'):
        return
    if has_module_permission(user, 'receipt_templates', 'view'):
        return
    raise PermissionDenied('You do not have permission to print receipts.')


def assert_can_view_templates(user) -> None:
    assert_can_print_receipt(user)


def assert_can_manage_receipt_designer(user, permission: str = 'view') -> None:
    if is_owner(user):
        return
    if has_module_permission(user, 'receipt_templates', permission):
        return
    raise PermissionDenied('You do not have permission for receipt template settings.')


def assert_can_edit_template_settings(user) -> None:
    assert_can_manage_receipt_designer(user, 'edit')
