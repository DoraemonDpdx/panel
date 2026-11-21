<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_passkeys', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('user_id');
            $table->string('name', 60);
            // base64url credential id, used to look a credential up during sign-in.
            $table->string('credential_id', 512)->unique();
            // The serialized WebAuthn credential record (public key, counter, transports...).
            $table->longText('credential');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_passkeys');
    }
};
