<?php

declare(strict_types=1);

/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

namespace Pterodactyl\Tests\Pest\Integration\Api\Admin\Roles\RoleControllerTest;

use Illuminate\Http\Response;
use Pterodactyl\Models\Mount;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Tests\Integration\Api\Admin\AdminApiIntegrationTestCase;

uses(AdminApiIntegrationTestCase::class);

function staff(array $permissions): User
{
    $role = Role::factory()->withPermissions($permissions)->create();

    return User::factory()->create(['root_admin' => false, 'role_id' => $role->id]);
}

/** The update endpoint takes the full user, so tests resend the current identity fields. */
function payload(User $user, array $extra = []): array
{
    return [
        'email' => $user->email,
        'username' => $user->username,
        'name_first' => $user->name_first,
        'name_last' => $user->name_last,
        ...$extra,
    ];
}

function owner(): User
{
    return User::factory()->create(['root_admin' => true, 'is_owner' => true]);
}

test('owner can create, update and delete a role', function (): void {
    $this->actingAs(owner());

    $response = $this->postJson(route('api.admin.roles.store'), [
        'name' => 'Support',
        'permissions' => ['admin:users.read', 'admin:servers.read'],
    ]);
    $response->assertStatus(Response::HTTP_CREATED);
    $this->assertDatabaseHas('roles', ['name' => 'Support']);

    $role = Role::query()->where('name', 'Support')->firstOrFail();

    $this->putJson(route('api.admin.roles.update', ['role' => $role->id]), ['permissions' => ['admin:users.read']])
        ->assertOk()
        ->assertJsonPath('attributes.permissions', ['admin:users.read']);

    $this->delete(route('api.admin.roles.delete', ['role' => $role->id]))->assertNoContent();
    $this->assertDatabaseMissing('roles', ['id' => $role->id]);
});

test('root admin can list grantable permissions', function (): void {
    $this->getJson(route('api.admin.roles.permissions'))
        ->assertOk()
        ->assertJsonFragment(['admin:users.read'])
        ->assertJsonPath('meta.can_manage', false);

    $this->actingAs(owner());
    $this->getJson(route('api.admin.roles.permissions'))->assertJsonPath('meta.can_manage', true);
});

test('root admin who is not an owner can read but not change roles', function (): void {
    $role = Role::factory()->create();

    $this->getJson(route('api.admin.roles'))->assertOk();
    $this->postJson(route('api.admin.roles.store'), ['name' => 'X', 'permissions' => []])->assertForbidden();
    $this->putJson(route('api.admin.roles.update', ['role' => $role->id]), ['permissions' => []])->assertForbidden();
    $this->delete(route('api.admin.roles.delete', ['role' => $role->id]))->assertForbidden();
    $this->assertDatabaseHas('roles', ['id' => $role->id]);
});

test('non-owner root admin cannot modify, delete or demote the owner', function (): void {
    $owner = owner();

    $this->putJson(route('api.admin.users.update', ['user' => $owner->id]), ['password' => 'Sup3r-Secret-Pass!'])->assertForbidden();
    $this->delete(route('api.admin.users.delete', ['user' => $owner->id]))->assertForbidden();
    $this->postJson(route('api.admin.users.disable-2fa', ['user' => $owner->id]))->assertForbidden();

    $this->actingAs($owner);
    $this->putJson(route('api.admin.users.update', ['user' => $owner->id]), ['root_admin' => false])->assertForbidden();
});

test('is_owner cannot be set through the API', function (): void {
    $target = User::factory()->create();

    $this->putJson(route('api.admin.users.update', ['user' => $target->id]), payload($target, ['is_owner' => true]))->assertOk();

    expect($target->fresh()->is_owner)->toBeFalse();
});

test('roles reject unknown and non-admin permissions', function (): void {
    $this->actingAs(owner());

    $this->postJson(route('api.admin.roles.store'), ['name' => 'Bad', 'permissions' => ['control.start']])
        ->assertUnprocessable();
    $this->postJson(route('api.admin.roles.store'), ['name' => 'Bad', 'permissions' => ['admin:nope.read']])
        ->assertUnprocessable();
});

test('deleting a role demotes its holders', function (): void {
    $this->actingAs(owner());
    $user = staff(['admin:users.read']);

    $this->delete(route('api.admin.roles.delete', ['role' => $user->role_id]))->assertNoContent();

    expect($user->fresh()->role_id)->toBeNull();
});

test('role holders cannot manage roles', function (): void {
    $this->actingAs(staff(['admin:users.read', 'admin:users.update']));

    $this->getJson(route('api.admin.roles'))->assertForbidden();
    $this->postJson(route('api.admin.roles.store'), ['name' => 'X', 'permissions' => []])->assertForbidden();
});

test('role holder is limited to the permissions of the role', function (): void {
    Mount::factory()->create();
    $this->actingAs(staff(['admin:mounts.read']));

    $this->getJson(route('api.admin.mounts'))->assertOk();
    $this->postJson(route('api.admin.mounts.store'), [])->assertForbidden();
    $this->getJson(route('api.admin.nodes'))->assertForbidden();
});

test('user without a role or root is still rejected', function (): void {
    $this->actingAsNonAdmin();

    $this->getJson(route('api.admin.mounts'))->assertForbidden();
});

test('role holder cannot grant root or assign roles', function (): void {
    $target = User::factory()->create();
    $this->actingAs(staff(['admin:users.update']));

    $this->putJson(route('api.admin.users.update', ['user' => $target->id]), ['root_admin' => true])->assertForbidden();
    $this->putJson(route('api.admin.users.update', ['user' => $target->id]), ['role_id' => Role::factory()->create()->id])->assertForbidden();
});

test('role holder can resend unchanged access fields when editing a user', function (): void {
    $target = User::factory()->create();
    $this->actingAs(staff(['admin:users.update']));

    $this->putJson(route('api.admin.users.update', ['user' => $target->id]), payload($target, [
        'name_first' => 'Renamed',
        'root_admin' => false,
        'role_id' => null,
    ]))->assertOk();
});

test('role holder cannot modify or delete other staff', function (): void {
    $root = User::factory()->create(['root_admin' => true]);
    $other = staff(['admin:users.read']);
    $this->actingAs(staff(['admin:users.update', 'admin:users.delete']));

    $this->putJson(route('api.admin.users.update', ['user' => $root->id]), ['password' => 'Sup3r-Secret-Pass!'])->assertForbidden();
    $this->delete(route('api.admin.users.delete', ['user' => $other->id]))->assertForbidden();
    $this->postJson(route('api.admin.users.disable-2fa', ['user' => $root->id]))->assertForbidden();
});

test('root admin can assign and clear a role on a user', function (): void {
    $user = User::factory()->create();
    $role = Role::factory()->create();

    $this->putJson(route('api.admin.users.update', ['user' => $user->id]), payload($user, ['role_id' => $role->id]))->assertOk();
    expect($user->fresh()->role_id)->toBe($role->id);

    $this->putJson(route('api.admin.users.update', ['user' => $user->id]), payload($user, ['role_id' => null]))->assertOk();
    expect($user->fresh()->role_id)->toBeNull();
});

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
