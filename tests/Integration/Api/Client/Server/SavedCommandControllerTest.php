<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\SavedCommandControllerTest;

use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\ServerSavedCommand;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

uses(ClientApiIntegrationTestCase::class);

test('a subuser with console access can create, list, update and delete saved commands', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::WebsocketConnect->value, Permissions::ControlConsole->value]);

    $created = $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => 'Save world', 'command' => 'save-all', 'confirm' => true])
        ->assertCreated()
        ->assertJsonPath('object', 'server_saved_command')
        ->assertJsonPath('attributes.confirm', true)
        ->assertJsonPath('attributes.position', 1);
    $this->assertActivityFor('server:saved-command.create', $user, $server);

    $id = $created->json('attributes.id');
    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => 'Say hi', 'command' => 'say hi'])
        ->assertCreated()->assertJsonPath('attributes.confirm', false);

    $this->actingAs($user)->getJson($this->link($server, '/console/commands'))
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.attributes.label', 'Save world');

    $this->actingAs($user)->putJson($this->link($server, "/console/commands/{$id}"), ['label' => 'Save', 'command' => 'save-all', 'confirm' => false])
        ->assertOk()->assertJsonPath('attributes.label', 'Save')->assertJsonPath('attributes.confirm', false);
    $this->assertActivityFor('server:saved-command.update', $user, $server);

    $this->actingAs($user)->deleteJson($this->link($server, "/console/commands/{$id}"))->assertNoContent();
    $this->assertActivityFor('server:saved-command.delete', $user, $server);
    expect(ServerSavedCommand::query()->where('server_id', $server->id)->count())->toBe(1);
});

test('users without console access cannot read or change saved commands', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::WebsocketConnect->value]);
    $command = ServerSavedCommand::query()->create(['server_id' => $server->id, 'label' => 'a', 'command' => 'b']);

    $this->actingAs($user)->getJson($this->link($server, '/console/commands'))->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => 'x', 'command' => 'y'])->assertForbidden();
    $this->actingAs($user)->putJson($this->link($server, "/console/commands/{$command->id}"), ['label' => 'x', 'command' => 'y'])->assertForbidden();
    $this->actingAs($user)->deleteJson($this->link($server, "/console/commands/{$command->id}"))->assertForbidden();
    $this->actingAs($user)->putJson($this->link($server, '/console/commands/order'), ['ids' => [$command->id]])->assertForbidden();
});

test('saved commands are validated and limited', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::ControlConsole->value]);

    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => '', 'command' => 'x'])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => str_repeat('a', 65), 'command' => 'x'])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => 'ok'])->assertUnprocessable();

    for ($i = 0; $i < ServerSavedCommand::LIMIT; $i++) {
        ServerSavedCommand::query()->create(['server_id' => $server->id, 'label' => "c{$i}", 'command' => 'x', 'position' => $i]);
    }

    $this->actingAs($user)->postJson($this->link($server, '/console/commands'), ['label' => 'one more', 'command' => 'x'])->assertStatus(400);
});

test('saved commands can be reordered and never cross servers', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::ControlConsole->value]);
    [, $other] = $this->generateTestAccount();
    $first = ServerSavedCommand::query()->create(['server_id' => $server->id, 'label' => 'first', 'command' => 'a', 'position' => 0]);
    $second = ServerSavedCommand::query()->create(['server_id' => $server->id, 'label' => 'second', 'command' => 'b', 'position' => 1]);
    $foreign = ServerSavedCommand::query()->create(['server_id' => $other->id, 'label' => 'foreign', 'command' => 'c', 'position' => 0]);

    $this->actingAs($user)->putJson($this->link($server, '/console/commands/order'), ['ids' => [$second->id, $foreign->id]])
        ->assertOk()
        ->assertJsonPath('data.0.attributes.label', 'second')
        ->assertJsonPath('data.1.attributes.label', 'first')
        ->assertJsonCount(2, 'data');
    $this->assertActivityFor('server:saved-command.reorder', $user, $server);
    expect($first->refresh()->position)->toBe(1)->and($foreign->refresh()->position)->toBe(0);

    $this->actingAs($user)->putJson($this->link($server, "/console/commands/{$foreign->id}"), ['label' => 'x', 'command' => 'y'])->assertNotFound();
    $this->actingAs($user)->deleteJson($this->link($server, "/console/commands/{$foreign->id}"))->assertNotFound();
});
