<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands\DeleteSavedCommandRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands\GetSavedCommandRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands\ReorderSavedCommandRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands\StoreSavedCommandRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands\UpdateSavedCommandRequest;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerSavedCommand;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Server Saved Commands', 'Console commands pinned to a server and shared with everyone who may use its console.')]
class SavedCommandController extends ClientApiController
{
    private const array COMMAND_EXAMPLE = [
        'object' => 'server_saved_command',
        'attributes' => ['id' => 1, 'label' => 'Save world', 'command' => 'save-all', 'confirm' => false, 'position' => 0],
    ];

    #[Endpoint('List saved commands', 'Returns the commands pinned to the server, in display order. Requires the control.console permission.')]
    #[ScribeResponse(['object' => 'list', 'data' => [self::COMMAND_EXAMPLE]], status: 200, description: 'Saved commands returned.')]
    public function index(GetSavedCommandRequest $request, Server $server): JsonResponse
    {
        $commands = ServerSavedCommand::query()->where('server_id', $server->id)->orderBy('position')->orderBy('id')->get();

        return new JsonResponse(['object' => 'list', 'data' => $commands->map(fn (ServerSavedCommand $command) => $this->present($command))->all()]);
    }

    #[Endpoint('Create a saved command', 'Pins a console command to the server. Requires the control.console permission.')]
    #[BodyParam('label', 'string', 'The button text.', example: 'Save world')]
    #[BodyParam('command', 'string', 'The command sent to the console.', example: 'save-all')]
    #[BodyParam('confirm', 'boolean', 'Ask before sending the command.', required: false, example: false)]
    #[ScribeResponse(self::COMMAND_EXAMPLE, status: 201, description: 'Saved command created.')]
    public function store(StoreSavedCommandRequest $request, Server $server): JsonResponse
    {
        $query = ServerSavedCommand::query()->where('server_id', $server->id);

        if ($query->count() >= ServerSavedCommand::LIMIT) {
            throw new DisplayException('A server can pin at most '.ServerSavedCommand::LIMIT.' commands.');
        }

        $command = ServerSavedCommand::query()->create([
            'server_id' => $server->id,
            'label' => $request->input('label'),
            'command' => $request->input('command'),
            'confirm' => $request->boolean('confirm'),
            'position' => (int) $query->max('position') + 1,
        ]);

        Activity::event('server:saved-command.create')->subject($server)->property(['label' => $command->label, 'command' => $command->command])->log();

        return new JsonResponse($this->present($command), 201);
    }

    #[Endpoint('Update a saved command', 'Changes the label, command or confirm flag of a pinned command. Requires the control.console permission.')]
    #[BodyParam('label', 'string', 'The button text.', example: 'Save world')]
    #[BodyParam('command', 'string', 'The command sent to the console.', example: 'save-all')]
    #[BodyParam('confirm', 'boolean', 'Ask before sending the command.', required: false, example: true)]
    #[ScribeResponse(self::COMMAND_EXAMPLE, status: 200, description: 'Saved command updated.')]
    public function update(UpdateSavedCommandRequest $request, Server $server, int $savedCommand): JsonResponse
    {
        $command = $this->find($server, $savedCommand);
        $command->update([
            'label' => $request->input('label'),
            'command' => $request->input('command'),
            'confirm' => $request->boolean('confirm', $command->confirm),
        ]);

        Activity::event('server:saved-command.update')->subject($server)->property(['label' => $command->label, 'command' => $command->command])->log();

        return new JsonResponse($this->present($command));
    }

    #[Endpoint('Delete a saved command', 'Removes a pinned command. Requires the control.console permission.')]
    #[ScribeResponse(status: 204, description: 'Saved command deleted.')]
    public function delete(DeleteSavedCommandRequest $request, Server $server, int $savedCommand): Response
    {
        $command = $this->find($server, $savedCommand);
        $command->delete();

        Activity::event('server:saved-command.delete')->subject($server)->property(['label' => $command->label, 'command' => $command->command])->log();

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    #[Endpoint('Reorder saved commands', 'Sets the display order from a list of command ids; ids not listed move to the end. Requires the control.console permission.')]
    #[BodyParam('ids', 'integer[]', 'Command ids in the order to show them.', example: [2, 1])]
    #[ScribeResponse(['object' => 'list', 'data' => [self::COMMAND_EXAMPLE]], status: 200, description: 'Saved commands reordered.')]
    public function reorder(ReorderSavedCommandRequest $request, Server $server): JsonResponse
    {
        /** @var list<int> $ids */
        $ids = array_map(intval(...), $request->input('ids', []));
        $commands = ServerSavedCommand::query()->where('server_id', $server->id)->orderBy('position')->orderBy('id')->get();
        $ordered = $commands->sortBy(fn (ServerSavedCommand $command) => [
            ($index = array_search($command->id, $ids, true)) === false ? PHP_INT_MAX : $index,
            $command->position,
            $command->id,
        ])->values();

        foreach ($ordered as $position => $command) {
            if ($command->position !== $position) {
                $command->update(['position' => $position]);
            }
        }

        Activity::event('server:saved-command.reorder')->subject($server)->log();

        return new JsonResponse(['object' => 'list', 'data' => $ordered->map(fn (ServerSavedCommand $command) => $this->present($command))->all()]);
    }

    private function find(Server $server, int $id): ServerSavedCommand
    {
        return ServerSavedCommand::query()->where('server_id', $server->id)->findOrFail($id);
    }

    /**
     * @return array{object: string, attributes: array{id: int, label: string, command: string, confirm: bool, position: int}}
     */
    private function present(ServerSavedCommand $command): array
    {
        return [
            'object' => ServerSavedCommand::RESOURCE_NAME,
            'attributes' => [
                'id' => $command->id,
                'label' => $command->label,
                'command' => $command->command,
                'confirm' => $command->confirm,
                'position' => $command->position,
            ],
        ];
    }
}
