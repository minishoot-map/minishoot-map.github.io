// @ts-check

const p1 = 'minishoot adventures '
const add = [
    'map', 'modules', 'pickup', 'race spirits', 'races', 'health crystals', 'upgrages',
    'red coins', 'bosses', 'map fragments', 'lore fragments', 'keys', 'dungeons',
    'temples', 'npc', 'enemies', 'scarabs', 'jars'
]
const add_ru = [
    'карты', 'модули', 'pickup', 'гонки', 'кристаллы здоровья', 'улучшения',
    'красные монеты', 'боссы', 'фрагменты карты', 'фрагменты лора', 'ключи', 'подземелья',
    'храмы', 'нпс', 'враги', 'скарабеи', 'кувшины'
]
let result = add.map(it => p1 + it).join(', ')
let result_ru = add_ru.map(it => p1 + it).join(', ')


export default {
    lang: [`en`, `ru`],
    title: [`Minishoot' Adventures Map`, `Карта Minishoot' Adventures`],
    head_desc: [
        "The most complete Minishoot' Adventures map. All collectables and locations.",
        "Самая полная карта Minishoot' Adventures. Все объекты и локации.",
    ],
    head_keywords: [result, result_ru],
    about_map: [
        'About the map:',
        'Информация о карте:'
    ],
    desc: [
        `The most complete <a target="blank" href="https://store.steampowered.com/app/1634860/">Minishoot' Adventures</a> map. Every object and location.`,
        `Самая полная карта <a target="blank" href="https://store.steampowered.com/app/1634860/">Minishoot' Adventures</a>. Все объекты и локации.`
    ],
    desc2: [
        'This map contains all race spirit locations, modules, coins, scarabs, keys, health, energy and other pickups. All NPCs and enemies, map and lore fragments, buttons, XP crystals, and every other game object.',
        'Карта содержит все гонки, модули, монеты, скарабеев, ключи, апгрейды HP, энергии и пр., NPC, врагов, фрагменты карты и лора, кнопки, кристаллы опыта и все остальные игровые объекты из версии <i>v1</i> игры.',
    ],
    about_proj: [
        'About the project:',
        'О проекте:'
    ],
    desc3: [
        `The data and images are extracted from the <i>v1</i> version of the game. The source code is available on`,
        `Данные и изображения извлечены из версии <i>v1</i> игры. Исходный код доступен на`
    ],
    map: [`Map`, `Карта`],
    object: [`Object`, `Объект`],
    filters: [`Filters`, `Фильтры`],
    about: [`About`, `О сайте`],
    sorry_js: [
        `Sorry, your browser doesn't support JavaScript`,
        `Извините, ваш браузер не поддерживает JavaScript`,
    ],
    sorry_webgl: [
        `Sorry, your browser doesn't support WebGL2`,
        `Извините, ваш браузер не поддердивает WebGL2`
    ],
    markers: ['Markers', 'Маркеры'],
    npcs: ['NPCs', 'NPC'],
    regkey: ['Regular keys', 'Обычные ключи'],
    bosskey: ['Boss keys', 'Ключи для боссов'],
    bossdropkey: ['Boss drop keys', 'Ключи с боссов'],
    uniquekey: ['Unique keys', 'Уникальные ключи'],
    module: ['Modules', 'Модули'],
    skill: ['Skills', 'Skills'],
    stats: ['Stats', 'Статы'],
    scarab: ['Scarabs', 'Скарабеи'],
    lore: ['Lore tablets', 'Lore tablets'],
    mappiece: ['Map pieces', 'Части карты'],
    enemy: ['Enemies', 'Враги'],
    filter_by_size: ['Filter by size', 'Отфильтровать по размеру'],
    filter_by_tier: ['Filter by tier', 'Отфильтровать по уровню'],
    jar: ['Jars', 'Горшки'],
    filter_by_drop: ['Filter by drop type', 'Отфильтровать по содержимому'],

    j0: ['nothing', 'ничего'],
    j2: ['random', 'случайное'],
    j3: ['big crystal', 'большой кристалл'],
    j4: ['energy', 'енергия'],
    j5: ['full energy', 'полная энергия'],
    j6: ['65 big crystals', '65 больших кристаллов'],

    crystal: ['Crystals', 'Кристаллы'],
    filter_by_xp: ['Filter by xp drop', 'Отфильтровать по наличию опыта'],
    transition: ['Entrances', 'Входы'],
    transitions_all: ['All Entrances', 'Все входы'],
    tunnel: ['Tunnels', 'Туннели'],
    torch: ['Torches', 'Факела'],
    other: ['All other objects (a lot!)', 'Все остальные объекты (много!)'],
    background: ['Backgrounds', 'Фоны'],

    loading: ['Loading...', 'Загружается...'],
    loading_object_info: ['Loading object information...', 'Информация об объекте загружается...'],
    loading_error: ['Loading error', 'Ошибка загрузки'],
    object_error: ['Error while loading information', 'Ошибка получения информации'],

    no: ['no', 'нет'],
    yes: ['yes', 'да'],
    more: ['more', 'больше'],
    name: ['Name', 'Название'],
    children: ['Children', 'Дочерние объекты'],
    parents: ['Parents', 'Родительские объекты'],
    no_selected: ['No object selected', 'Объект не выбран'],
    focus: ['Center on item', 'Показать'],
    copyurl: ['Copy URL', 'Скопировать URL'],
    position: ['Position', 'Позиция'],
    components: ['Components', 'Компоненты'],
    referenced: ['Referenced by', 'Ссылки в других объектах'],
    localpos: ['Local position', 'Локальная позиция'],
    localscale: ['Local scale', 'Локальный размер'],
    localrot: ['Local rotation', 'Локальное вращение'],
    dropsxp: ['Drops XP', 'Содержит опыт'],
    size: ['Size', 'Размер'],
    inv: ['Invincible', 'Неуязвимый'],
    permanent: ['Permanent', 'Перманентный'],
    offset: ['Offset', 'Сдвиг'],
    radius: ['Radius', 'Радиус'],
    target: ['Target', 'Цель'],
    group: ['Group', 'Группа'],
    prereq: ['Prereqisute', 'Условие'],
    level: ['Level', 'Уровень'],
    price: ['Price', 'Цена'],
    forsale: ['For sale', 'Продаётся'],
    i_title: ['Title', 'Название'],
    i_desc: ['Description', 'Описание'],
    owner: ['Owner', 'Продваец'],
    dest: ['Destination', 'Куда'],
    droptype: ['Drop type', 'Тип дропа'],
    tier: ['Tier', 'Уровень'],
    away: ['away', 'в'],
    objnear: ['Objects nearby', 'Объекты поблизости'],
    m: ['m', 'м'],

    preset: ['Preset', 'Пресет'],
    preset_custom: ["Custom", "Пользовательский"],
    preset_dungeon: ["Dungeon entrances", "Входы в подземелья"],
    preset_energy: ["Energy upgrades", "Улучшения энергии"],
    preset_hp: ["Heart crystals", "Кристаллы HP"],
    preset_map: ["Map & Lore fragments", "Фрагменты карты и лора"],
    preset_modules: ["Modules & Skills", "Модули и навыки"],
    preset_raceSpirits: ["Race spirits", "Гонки"],
    preset_redCoins: ["Red coins (Big crystals)", "Красные монеты"],
    preset_scarabs: ["Scarabs", "Скарабеи"],
    preset_temples: ["Temple & Tower entrances", "Входы в храмы и башни"],
} as const
