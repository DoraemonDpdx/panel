<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Mods\Import\PrismListParserTest;

use Pterodactyl\Services\Servers\Mods\Import\PrismEntry;
use Pterodactyl\Services\Servers\Mods\Import\PrismListParser;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

/**
 * Reduces entries to plain rows so tests can compare them without building objects.
 *
 * @param  list<PrismEntry>  $entries
 * @return list<array{int, string, ?string, ?string, ?string}>
 */
function prismRows(array $entries): array
{
    return array_map(
        fn (PrismEntry $entry): array => [$entry->line, $entry->name, $entry->url, $entry->version, $entry->filename],
        $entries,
    );
}

// HTML export

test('parses an HTML export with versions and entities', function (): void {
    $html = <<<'HTML'
    <!DOCTYPE html>
    <html>
    <head><title>Mods</title></head>
    <body>
    <h1>Mods</h1>
    <ul>
    <li><a href="https://modrinth.com/mod/sodium">Sodium</a> [0.5.8]</li>
    <li><a href="https://www.curseforge.com/minecraft/mc-mods/jei">Just Enough Items</a> [15.2.0]</li>
    <li><a href="https://modrinth.com/mod/create?loader=fabric&amp;v=1">Create &amp; Friends</a> [0.5.1]</li>
    <li><a href="https://modrinth.com/mod/quotes">&quot;Quoted&quot; Mod</a></li>
    </ul>
    </body>
    </html>
    HTML;

    expect(prismRows((new PrismListParser)->parse($html)))->toBe([
        [7, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
        [8, 'Just Enough Items', 'https://www.curseforge.com/minecraft/mc-mods/jei', '15.2.0', null],
        [9, 'Create & Friends', 'https://modrinth.com/mod/create?loader=fabric&v=1', '0.5.1', null],
        [10, '"Quoted" Mod', 'https://modrinth.com/mod/quotes', null, null],
    ]);
});

test('parses an HTML export with CRLF line endings and keeps line numbers', function (): void {
    $html = "<ul>\r\n<li><a href=\"https://modrinth.com/mod/sodium\">Sodium</a> [0.5.8]</li>\r\n<li><a href=\"https://modrinth.com/mod/iris\">Iris</a></li>\r\n</ul>\r\n";

    expect(prismRows((new PrismListParser)->parse($html)))->toBe([
        [2, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
        [3, 'Iris', 'https://modrinth.com/mod/iris', null, null],
    ]);
});

test('HTML export drops duplicate urls, non-http links and empty items', function (): void {
    $html = <<<'HTML'
    <ul>
    <li><a href="javascript:alert(1)">Evil</a> [1.0]</li>
    <li><a href="https://modrinth.com/mod/sodium">Sodium</a> [0.5.8]</li>
    <li><a href="https://modrinth.com/mod/sodium">Sodium again</a></li>
    <li></li>
    <li>Plain text mod [2.0]</li>
    <li>Tom &amp; Jerry [1.0]</li>
    </ul>
    HTML;

    expect(prismRows((new PrismListParser)->parse($html)))->toBe([
        [2, 'Evil', null, '1.0', null],
        [3, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
        [6, 'Plain text mod', null, '2.0', null],
        [7, 'Tom & Jerry', null, '1.0', null],
    ]);
});

test('HTML export accepts list items with no closing tag', function (): void {
    $html = <<<'HTML'
    <ul>
    <li><a href="https://modrinth.com/mod/lithium">Lithium</a> [0.12.1]
    <li><a href="https://modrinth.com/mod/iris">Iris</a>
    </ul>
    HTML;

    expect(prismRows((new PrismListParser)->parse($html)))->toBe([
        [2, 'Lithium', 'https://modrinth.com/mod/lithium', '0.12.1', null],
        [3, 'Iris', 'https://modrinth.com/mod/iris', null, null],
    ]);
});

// Markdown export

test('parses a Markdown export and ignores headings and prose', function (): void {
    $markdown = <<<'MD'
    # Mods

    - [Sodium](https://modrinth.com/mod/sodium) [0.5.8]
    - [Iris Shaders](https://modrinth.com/mod/iris) [1.7.0]
    1. [Lithium](https://modrinth.com/mod/lithium)

    Exported by Prism Launcher
    MD;

    expect(prismRows((new PrismListParser)->parse($markdown)))->toBe([
        [3, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
        [4, 'Iris Shaders', 'https://modrinth.com/mod/iris', '1.7.0', null],
        [5, 'Lithium', 'https://modrinth.com/mod/lithium', null, null],
    ]);
});

test('Markdown export unescapes names and handles CRLF', function (): void {
    $markdown = "- [Iris\\_Shaders](https://modrinth.com/mod/iris) [1.7.0]\r\n- [Create](https://modrinth.com/mod/create)\r\n";

    expect(prismRows((new PrismListParser)->parse($markdown)))->toBe([
        [1, 'Iris_Shaders', 'https://modrinth.com/mod/iris', '1.7.0', null],
        [2, 'Create', 'https://modrinth.com/mod/create', null, null],
    ]);
});

test('Markdown export drops a repeated url and keeps a link that is not http', function (): void {
    $markdown = <<<'MD'
    - [Sodium](https://modrinth.com/mod/sodium) [0.5.8]
    - [Sodium Copy](https://modrinth.com/mod/sodium)
    - [Evil](javascript:alert(1))
    Some plain prose with no links
    - [Lithium]
    MD;

    expect(prismRows((new PrismListParser)->parse($markdown)))->toBe([
        [1, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
        [3, 'Evil', null, null, null],
    ]);
});

test('Markdown export takes the name from the URL when the link text is empty', function (): void {
    $markdown = "- [](https://www.curseforge.com/minecraft/mc-mods/jei)\n- [Sodium](https://modrinth.com/mod/sodium)";

    expect(prismRows((new PrismListParser)->parse($markdown)))->toBe([
        [1, 'jei', 'https://www.curseforge.com/minecraft/mc-mods/jei', null, null],
        [2, 'Sodium', 'https://modrinth.com/mod/sodium', null, null],
    ]);
});

// Plaintext export

test('parses a plaintext export with one name per line, trimmed', function (): void {
    $text = "Sodium\n Iris Shaders\n  Lithium  \n";

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [1, 'Sodium', null, null, null],
        [2, 'Iris Shaders', null, null, null],
        [3, 'Lithium', null, null, null],
    ]);
});

test('plaintext export reads bracketed versions and parenthesised filenames', function (): void {
    $text = <<<'TXT'
    Sodium (sodium-fabric-0.5.8+mc1.20.1.jar)
    Iris Shaders [1.7.0]
    Fabric API [0.92.0] (fabric-api-0.92.0+1.20.1.jar)
    Cloth Config (cloth-config-11.1.106-fabric.jar)
    TXT;

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [1, 'Sodium', null, null, 'sodium-fabric-0.5.8+mc1.20.1.jar'],
        [2, 'Iris Shaders', null, '1.7.0', null],
        [3, 'Fabric API', null, '0.92.0', 'fabric-api-0.92.0+1.20.1.jar'],
        [4, 'Cloth Config', null, null, 'cloth-config-11.1.106-fabric.jar'],
    ]);
});

test('plaintext export skips headings, separators and label lines', function (): void {
    $text = <<<'TXT'
    Mods:
    ----
    # Heading
    ***
    Sodium
    Lithium
    Sodium
    TXT;

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [5, 'Sodium', null, null, null],
        [6, 'Lithium', null, null, null],
    ]);
});

test('plaintext export de-duplicates names case-insensitively with CRLF', function (): void {
    $text = "sodium\r\nSODIUM\r\nLithium\r\n";

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [1, 'sodium', null, null, null],
        [3, 'Lithium', null, null, null],
    ]);
});

// JSON export

test('parses a JSON export array of mod objects', function (): void {
    $json = <<<'JSON'
    [
      {"name": "Sodium", "url": "https://modrinth.com/mod/sodium", "version": "0.5.8", "filename": "sodium-fabric-0.5.8.jar", "authors": ["jellysquid"]},
      {"name": "Lithium", "version": "0.12.1"}
    ]
    JSON;

    expect(prismRows((new PrismListParser)->parse($json)))->toBe([
        [1, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', 'sodium-fabric-0.5.8.jar'],
        [2, 'Lithium', null, '0.12.1', null],
    ]);
});

test('JSON export falls back to filename then URL when the name is missing', function (): void {
    $json = <<<'JSON'
    [
      {"filename": "iris-1.7.0.jar", "url": "https://cdn.modrinth.com/data/YuKDqWKC/versions/abcdefgh/iris-1.7.0.jar"},
      {"url": "https://modrinth.com/mod/lithium"},
      {"name": "   "},
      "Just a string",
      {"name": 42, "version": "1"},
      {"name": "Sodium", "version": 0.5}
    ]
    JSON;

    expect(prismRows((new PrismListParser)->parse($json)))->toBe([
        [1, 'iris-1.7.0.jar', 'https://cdn.modrinth.com/data/YuKDqWKC/versions/abcdefgh/iris-1.7.0.jar', null, 'iris-1.7.0.jar'],
        [2, 'lithium', 'https://modrinth.com/mod/lithium', null, null],
        [6, 'Sodium', null, null, null],
    ]);
});

test('text starting with a bracket that is not valid JSON is read as plaintext', function (): void {
    $text = "[1.0] Sodium\n[1.1] Lithium";

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [1, 'Sodium', null, '1.0', null],
        [2, 'Lithium', null, '1.1', null],
    ]);
});

test('an empty JSON array gives no entries', function (): void {
    expect((new PrismListParser)->parse("[\n]"))->toBe([]);
});

// CSV export

test('parses a CSV export with a header row', function (): void {
    $csv = <<<'CSV'
    name,url,version,filename
    Sodium,https://modrinth.com/mod/sodium,0.5.8,sodium-fabric-0.5.8.jar
    Lithium,,0.12.1,
    "Create, Fabric",https://modrinth.com/mod/create,0.5.1,
    ,,0.1,
    CSV;

    expect(prismRows((new PrismListParser)->parse($csv)))->toBe([
        [2, 'Sodium', 'https://modrinth.com/mod/sodium', '0.5.8', 'sodium-fabric-0.5.8.jar'],
        [3, 'Lithium', null, '0.12.1', null],
        [4, 'Create, Fabric', 'https://modrinth.com/mod/create', '0.5.1', null],
    ]);
});

test('CSV export accepts columns in any order with CRLF and spaces in the header', function (): void {
    $csv = "URL , Name\r\nhttps://modrinth.com/mod/sodium,Sodium\r\n\r\nhttps://www.curseforge.com/minecraft/mc-mods/jei,Just Enough Items\r\n";

    expect(prismRows((new PrismListParser)->parse($csv)))->toBe([
        [2, 'Sodium', 'https://modrinth.com/mod/sodium', null, null],
        [4, 'Just Enough Items', 'https://www.curseforge.com/minecraft/mc-mods/jei', null, null],
    ]);
});

test('CSV export takes the name from the URL when there is no name column', function (): void {
    $csv = "url,version\nhttps://modrinth.com/mod/sodium,0.5.8";

    expect(prismRows((new PrismListParser)->parse($csv)))->toBe([
        [2, 'sodium', 'https://modrinth.com/mod/sodium', '0.5.8', null],
    ]);
});

test('CSV export with only a header gives no entries', function (): void {
    expect((new PrismListParser)->parse('name,url,version'))->toBe([]);
});

// Plain URL list

test('parses a plain list of URLs and names each from its slug or file name', function (): void {
    $text = <<<'TXT'
    https://modrinth.com/mod/sodium
    https://www.curseforge.com/minecraft/mc-mods/jei/files/4567890
    https://cdn.modrinth.com/data/AANobbMI/versions/P7dR8mSH/lithium-fabric.jar
    https://modrinth.com/mod/sodium/
    TXT;

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [1, 'sodium', 'https://modrinth.com/mod/sodium', null, null],
        [2, 'jei', 'https://www.curseforge.com/minecraft/mc-mods/jei/files/4567890', null, null],
        [3, 'lithium-fabric.jar', 'https://cdn.modrinth.com/data/AANobbMI/versions/P7dR8mSH/lithium-fabric.jar', null, null],
    ]);
});

test('URL list skips blank and junk lines and trims each URL', function (): void {
    $text = "\n\n  https://modrinth.com/project/AANobbMI  \n# not a link\nhttps://www.curseforge.com/minecraft/bukkit-plugins/essentialsx\n";

    expect(prismRows((new PrismListParser)->parse($text)))->toBe([
        [3, 'AANobbMI', 'https://modrinth.com/project/AANobbMI', null, null],
        [5, 'essentialsx', 'https://www.curseforge.com/minecraft/bukkit-plugins/essentialsx', null, null],
    ]);
});

// Shared behaviour

test('empty or blank input gives no entries', function (): void {
    expect((new PrismListParser)->parse(''))->toBe([]);
    expect((new PrismListParser)->parse("   \n\n \r\n"))->toBe([]);
});

test('a UTF-8 byte order mark is ignored', function (): void {
    expect(prismRows((new PrismListParser)->parse("\xEF\xBB\xBFSodium\nLithium")))->toBe([
        [1, 'Sodium', null, null, null],
        [2, 'Lithium', null, null, null],
    ]);
});

test('caps the result at 1000 entries', function (): void {
    $lines = [];
    for ($i = 1; $i <= 1500; $i++) {
        $lines[] = "Mod $i";
    }

    $entries = (new PrismListParser)->parse(implode("\n", $lines));

    expect($entries)->toHaveCount(1000);
    expect($entries[0]->name)->toBe('Mod 1');
    expect($entries[999]->name)->toBe('Mod 1000');
    expect($entries[999]->line)->toBe(1000);
});

test('duplicates do not count towards the cap', function (): void {
    $lines = [];
    for ($i = 1; $i <= 1200; $i++) {
        $lines[] = "Mod $i";
        $lines[] = "Mod $i";
    }

    expect((new PrismListParser)->parse(implode("\n", $lines)))->toHaveCount(1000);
});
