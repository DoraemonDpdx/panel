<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Illuminate\Database\Eloquent\Model;
use Pterodactyl\Actions\Users\CreateUser;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;
use Pterodactyl\Http\Requests\Concerns\ValidatesExtensionFields;
use Pterodactyl\Models\User;

class StoreUserRequest extends AdminApiRequest
{
    use ValidatesExtensionFields {
        actionInput as private inputWithExtensions;
    }

    public function permissions(): array
    {
        return [Permissions::AdminUsersCreate];
    }

    /**
     * Only root administrators may change root access or a role assignment; otherwise a role
     * holder with admin:users.update could promote themselves or anyone else. Role
     * holders also cannot act on other staff accounts, whose passwords or 2FA they
     * could otherwise reset to take them over.
     */
    public function authorize(): bool
    {
        if (! parent::authorize()) {
            return false;
        }

        $actor = $this->user();
        $target = $this->route('user');
        $target = $target instanceof User ? $target : null;

        // The owner account stays a root administrator and can only be changed by the owner.
        if ($target?->is_owner) {
            if (! $actor->is($target) || ($this->has('root_admin') && ! $this->boolean('root_admin'))) {
                return false;
            }
        }

        if ($actor->root_admin) {
            return true;
        }

        // Clients send the full form back, so only a value that actually changes is refused.
        if ($this->has('root_admin') && $this->boolean('root_admin') !== (bool) $target?->root_admin) {
            return false;
        }

        if ($this->has('role_id')) {
            $roleId = $this->input('role_id');
            $roleId = $roleId === null || $roleId === '' ? null : (int) $roleId;

            if ($roleId !== $target?->role_id) {
                return false;
            }
        }

        return ! ($target && $target->isStaff() && ! $target->is($actor));
    }

    /**
     * Validation rules for creating a user.
     *
     * @param  NormalizedValidationRules|null  $rules
     * @return ValidationRules
     */
    public function rules(?array $rules = null): array
    {
        $rules ??= CreateUser::rules();

        return [
            'external_id' => $rules['external_id'],
            'email' => $rules['email'],
            'username' => $rules['username'],
            'password' => $rules['password'],
            'root_admin' => $rules['root_admin'],
            'role_id' => $rules['role_id'],
            'name_first' => $rules['name_first'],
            'name_last' => $rules['name_last'],
            // Nested on input; actionInput() hands it to the action as `language`.
            'preferences.language' => $rules['language'],
        ];
    }

    /**
     * The validated input, with the language sent under `preferences` moved to the
     * action's `language` key.
     *
     * @return array<string, mixed>
     */
    public function actionInput(): array
    {
        $input = $this->inputWithExtensions();
        unset($input['preferences']);

        $validated = $this->safe();
        if ($validated->has('preferences.language')) {
            $input['language'] = $validated->string('preferences.language')->toString();
        }

        return $input;
    }

    /** Rename fields to be more clear in error messages. */
    public function attributes(): array
    {
        return [
            'external_id' => 'Third Party Identifier',
            'name_first' => 'First Name',
            'name_last' => 'Last Name',
            'root_admin' => 'Root Administrator Status',
        ];
    }

    /**
     * {@inheritdoc}
     */
    protected function extensionFieldsModel(): Model|string
    {
        return User::class;
    }
}
