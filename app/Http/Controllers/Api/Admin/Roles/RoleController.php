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

namespace Pterodactyl\Http\Controllers\Api\Admin\Roles;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Extensions\Scribe\Attributes\ResponseFromResource;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Roles\DeleteRoleRequest;
use Pterodactyl\Http\Requests\Api\Admin\Roles\GetRoleRequest;
use Pterodactyl\Http\Requests\Api\Admin\Roles\GetRolesRequest;
use Pterodactyl\Http\Requests\Api\Admin\Roles\StoreRoleRequest;
use Pterodactyl\Http\Requests\Api\Admin\Roles\UpdateRoleRequest;
use Pterodactyl\Http\Resources\Api\Admin\RoleResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\Role;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Roles', 'Create and manage admin roles that grant a subset of admin permissions.')]
class RoleController extends AdminApiController
{
    #[Endpoint('List roles', 'Returns a paginated list of admin roles.')]
    #[QueryParam('filter[name]', 'string', 'Filter roles by name.', required: false, example: 'Support')]
    #[QueryParam('sort', 'string', 'Sort roles by id, name or created_at. Prefix with a hyphen for descending order.', required: false, example: 'name')]
    #[QueryParam('page', 'integer', 'Page number to return.', required: false, example: 1)]
    #[QueryParam('per_page', 'integer', 'Results to return per page.', required: false, example: 50)]
    #[ResponseFromResource(RoleResource::class, Role::class, description: 'Roles returned.', collection: true, resourceKey: 'role', paginate: 50)]
    public function index(GetRolesRequest $request): ApiResourceCollection
    {
        $roles = QueryBuilder::for(Role::query()->withCount('users'))
            ->allowedFilters(['name'])
            ->allowedSorts(['id', 'name', 'created_at'])
            ->paginate($request->perPage());

        return RoleResource::collection($roles);
    }

    /**
     * The admin:* permission keys a role may be granted.
     */
    #[Endpoint('List grantable permissions', 'Returns the admin permission keys a role may be granted.')]
    #[ScribeResponse(['data' => ['admin:servers.read'], 'meta' => ['can_manage' => true]], status: 200, description: 'Permissions returned.')]
    public function permissions(GetRolesRequest $request): JsonResponse
    {
        return new JsonResponse([
            'data' => Role::grantablePermissions(),
            'meta' => ['can_manage' => (bool) $request->user()->is_owner],
        ]);
    }

    #[Endpoint('Get role', 'Returns a single role by ID.')]
    #[ResponseFromResource(RoleResource::class, Role::class, description: 'Role returned.', resourceKey: 'role')]
    public function show(GetRoleRequest $request, Role $role): RoleResource
    {
        $role->loadCount('users');

        return RoleResource::make($role);
    }

    #[Endpoint('Create role', 'Creates an admin role.')]
    #[BodyParam('name', 'string', 'The role name.', example: 'Support')]
    #[BodyParam('description', 'string', 'What the role is for.', required: false, example: 'Handles tickets and servers.')]
    #[BodyParam('permissions', 'string[]', 'The admin:* permissions the role grants.', example: ['admin:servers.read'])]
    #[ResponseFromResource(RoleResource::class, Role::class, status: 201, description: 'Role created.', resourceKey: 'role', meta: ['resource' => 'https://panel.example.com/api/admin/roles/1'])]
    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = Role::query()->create($request->validated());

        Activity::event('admin:role.create')
            ->subject($role)
            ->property('name', $role->name)
            ->log();

        return RoleResource::make($role)
            ->withMeta(['resource' => route('api.admin.roles.view', ['role' => $role->id])])
            ->respond(Response::HTTP_CREATED);
    }

    #[Endpoint('Update role', 'Updates an existing admin role.')]
    #[BodyParam('name', 'string', 'The role name.', example: 'Support')]
    #[BodyParam('description', 'string', 'What the role is for.', required: false, example: 'Handles tickets and servers.')]
    #[BodyParam('permissions', 'string[]', 'The admin:* permissions the role grants.', example: ['admin:servers.read'])]
    #[ResponseFromResource(RoleResource::class, Role::class, description: 'Role updated.', resourceKey: 'role')]
    public function update(UpdateRoleRequest $request, Role $role): RoleResource
    {
        $role->update($request->validated());
        $role->loadCount('users');

        Activity::event('admin:role.update')
            ->subject($role)
            ->property('name', $role->name)
            ->log();

        return RoleResource::make($role);
    }

    #[Endpoint('Delete role', 'Deletes a role; users holding it lose its permissions.')]
    #[ScribeResponse(status: 204, description: 'Role deleted.')]
    public function destroy(DeleteRoleRequest $request, Role $role): Response
    {
        $role->delete();

        Activity::event('admin:role.delete')
            ->subject($role)
            ->property('name', $role->name)
            ->log();

        return $this->returnNoContent();
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
