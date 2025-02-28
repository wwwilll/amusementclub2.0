const asdate    = require('add-subtract-date')
const {firstBy} = require('thenby')

const {
    cap,
    tryGetUserID,
    nameSort,
    escapeRegex,
} = require('../utils/tools')

const { 
    bestColMatch, 
    bestColMatchMulti,
} = require('./collection')

const { 
    fetchTaggedCards,
} = require('./tag')

const { 
    evalCardFast,
} = require('./eval')

const { 
    fetchInfo,
} = require('./meta')

const promoRarity = {
    halloween: '🎃',
    christmas: '❄',
    valentine: '🍫',
    birthday: '🎂',
    halloween18: '🍬',
    christmas18: '🎄',
    valentine19: '💗',
    halloween19: '👻',
    christmas19: '☃️',
    birthday20: '🎈',
    christmas20: '🎁',
    valentine21: '🌹',
    birthday21: '🧁',
    halloween21: '🕸️',
}

const formatName = (x) => {
    const promo = promoRarity[x.col]
    const rarity = promo? `\`${new Array(x.level + 1).join(promo)}\`` : new Array(x.level + 1).join('★')
    return `[${rarity}]${x.fav? ' `❤` ' : ' '}[${cap(x.name.replace(/_/g, ' '))}](${x.shorturl}) \`[${x.col}]\``
    //return `[${new Array(x.level + 1).join('★')}]${x.fav? ' `❤` ' : ' '}[${cap(x.name.replace(/_/g, ' '))}](${x.shorturl}) \`[${x.col}]\``
}

const parseArgs = (ctx, args, user) => {
    const lastdaily = user? user.lastdaily: asdate.subtract(new Date(), 1, 'day')

    const cols = [], levels = [], keywords = []
    const anticols = [], antilevels = []
    let sort
    const q = { 
        ids: [], 
        sort: null,
        filters: [],
        tags: [],
        antitags: [],
        extra: [],
        lastcard: false,
        diff: 0,
        me: 0,
        bid: 0,
        fav: false,
        evalQuery: false,
        userQuery: false,
    }

    args.map(x => {
        let substr = x.substr(1)

        if(x === '.') {
            q.lastcard = true

        } else if((x[0] === '<' || x[0] === '>' || x[0] === '=' || x[0] === '\\') && x[1] != '@') {
            const lt = x[0] === '<'
            switch(substr) {
                case 'date':
                    sort = sortBuilder(ctx, sort,(a, b) => a.obtained - b.obtained, lt)
                    q.userQuery = true
                    break
                case 'amount':
                    sort = sortBuilder(ctx, sort,(a, b) => a.amount - b.amount, lt)
                    break
                case 'name':
                    sort = sortBuilder(ctx, sort,(a, b) => nameSort(a, b) , lt)
                    break
                case 'star':
                    sort = sortBuilder(ctx, sort,(a, b) => a.level - b.level , lt)
                    break
                case 'col':
                    sort = sortBuilder(ctx, sort,(a, b) => nameSort(a, b, "col") , lt)
                    break
                case 'eval':
                    sort = sortBuilder(ctx, sort,(a, b) => evalSort(ctx, a, b) , lt)
                    q.evalQuery = true
                    break
                case 'rating':
                    sort = sortBuilder(ctx, sort,(a, b) => (a.rating || 0) - (b.rating || 0), lt)
                    q.userQuery = true
                    break
                default: {
                    const eq = x[1] === '='
                    eq? substr = x.substr(2): substr
                    const escHeart = x[0] === '\\'
                    if (escHeart && x[1] === '<') {
                        x = x.substr(1)
                        substr = x.substr(1)
                    }
                    switch(x[0]) {
                        case '>' : q.filters.push(c => eq? c.amount >= substr: c.amount > substr); q.userQuery = true; break
                        case '<' : q.filters.push(c => eq? c.amount <= substr: c.amount < substr); q.userQuery = true; break
                        case '=' : q.filters.push(c => c.amount == substr); q.userQuery = true; break
                    }

                }
            }
        } else if(x[0] === '-' || x[0] === '!') {
            if(x[0] === '!' && x[1] === '#') {
                q.antitags.push(substr.substr(1))
            } else {
                const m = x[0] === '-'
                switch(substr) {
                    case 'gif': q.filters.push(c => c.animated == m); break
                    case 'multi': q.filters.push(c => m? c.amount > 1 : c.amount === 1); q.userQuery = true; break
                    case 'fav': q.filters.push(c => m? c.fav : !c.fav); m? q.fav = true: q.fav; q.userQuery = true; break
                    case 'new': q.filters.push(c => m? c.obtained > lastdaily : c.obtained <= lastdaily); q.userQuery = true; break
                    case 'rated': q.filters.push(c => m? c.rating: !c.rating); q.userQuery = true; break
                    case 'wish': q.filters.push(c => m? user.wishlist.includes(c.id): !user.wishlist.includes(c.id)); break
                    case 'promo': const mcol = bestColMatchMulti(ctx, substr); m? mcol.map(x=> cols.push(x.id)): mcol.map(x=> anticols.push(x.id)); break
                    case 'diff': q.diff = m? 1: 2; break
                    case 'miss': q.diff = m? 1: 2; break
                    case 'me':  q.me = m? 1: 2; break
                    case 'bid': q.bid = m? 1 : 2; break
                    default: {
                        const pcol = bestColMatch(ctx, substr)
                        if(m) {
                            if(parseInt(substr)) levels.push(parseInt(substr))
                            else if(pcol) cols.push(pcol.id)
                        } else {
                            if(parseInt(substr)) antilevels.push(parseInt(substr))
                            else if(pcol) anticols.push(pcol.id)
                        }
                    }
                }
            }
        } else if(x[0] === '#') {
            q.tags.push(substr.replace(/[^\w]/gi, ''))
        } else if(x[0] === ':') {
            q.extra.push(substr)
        } else {
            const tryid = tryGetUserID(x)
            if(tryid) q.ids.push(tryid)
            else keywords.push(x)
        }
    })

    if(cols.length > 0) q.filters.push(c => cols.includes(c.col))
    if(levels.length > 0) q.filters.push(c => levels.includes(c.level))
    if(anticols.length > 0) q.filters.push(c => !anticols.includes(c.col))
    if(antilevels.length > 0) q.filters.push(c => !antilevels.includes(c.level))
    if(keywords.length > 0) 
        q.filters.push(c => (new RegExp(`(_|^)${keywords.map(k => escapeRegex(k)).join('.*')}`, 'gi')).test(c.name))

    q.isEmpty = (usetag = true) => {
        return !q.ids[0] && !q.lastcard && !q.filters[0] && !((q.tags[0] || q.antitags[0]) && usetag)
    }
    if (!sort)
        q.sort = firstBy((a, b) => b.level - a.level).thenBy("col").thenBy("name")
    else
        q.sort = sort

    return q
}

const evalSort = (ctx, a, b) => {
    if(evalCardFast(ctx, a) > evalCardFast(ctx, b))return 1
    if(evalCardFast(ctx, a) < evalCardFast(ctx, b))return -1
    return 0
}

const sortBuilder = (ctx, sort, sortby, lt) => {
    if (!sort)
        return firstBy(sortby, {direction: lt? "asc": "desc"})
    else
        return sort.thenBy(sortby, {direction: lt? "asc": "desc"})
}

const filter = (cards, query) => {
    query.filters.map(f => cards = cards.filter(f))
    //return cards.sort(nameSort)
    return cards
}

const equals = (card1, card2) => {
    return card1.name === card2.name && card1.level === card2.level && card1.col === card2.col
}

const addUserCard = (user, cardID) => {
    const matched = user.cards.findIndex(x => x.id == cardID)
    if(matched > -1) {
        user.cards[matched].amount++
        user.markModified('cards')
        return user.cards[matched].amount
    }

    user.cards.push({ id: cardID, amount: 1, obtained: new Date() })
    return 1
}

const removeUserCard = (ctx, user, cardID) => {
    const matched = user.cards.findIndex(x => x.id == cardID)
    const card = user.cards[matched]
    user.cards[matched].amount--
    user.cards = user.cards.filter(x => x.amount > 0)
    user.markModified('cards')

    if(card.amount === 0 && card.rating) {
        removeRating(ctx, cardID, card.rating)
    }

    return user.cards[matched]? user.cards[matched].amount : 0
}

const mapUserCards = (ctx, user) => {
    return user.cards.filter(x => x.id < ctx.cards.length).map(x => Object.assign({}, ctx.cards[x.id], x))
}

/**
 * Helper function to enrich the comamnd with user cards
 * @param  {Function} callback command handler
 * @return {Promise}
 */
const withCards = (callback) => async (ctx, user, ...args) => {
    if(user.cards.length == 0)
        return ctx.reply(user, `you don't have any cards. Get some using \`${ctx.prefix}claim\``, 'red')

    const parsedargs = parseArgs(ctx, args, user)
    const map = mapUserCards(ctx, user)
    let cards = filter(map, parsedargs)

    if(parsedargs.tags.length > 0) {
        const tgcards = await fetchTaggedCards(parsedargs.tags)
        cards = cards.filter(x => tgcards.includes(x.id))
    }

    if(parsedargs.antitags.length > 0) {
        const tgcards = await fetchTaggedCards(parsedargs.antitags)
        cards = cards.filter(x => !tgcards.includes(x.id))
    }

    if(parsedargs.lastcard)
        cards = map.filter(x => x.id === user.lastcard)

    if(cards.length == 0)
        return ctx.reply(user, `no cards found matching \`${args.join(' ')}\``, 'red')

    cards.sort(parsedargs.sort)

    if(!parsedargs.lastcard && cards.length > 0) {
        user.lastcard = cards[0].id
        await user.save()
    }

    return callback(ctx, user, cards, parsedargs, args)
}

/**
 * Helper function to enrich the comamnd with selected card
 * @param  {Function} callback command handler
 * @return {Promise}
 */
const withGlobalCards = (callback) => async(ctx, user, ...args) => {
    const parsedargs = parseArgs(ctx, args, user)
    let allcards
    if(parsedargs.userQuery)
        allcards = mapUserCards(ctx, user)
    else 
        allcards = ctx.cards.slice()

    let cards = filter(allcards, parsedargs)
    if(parsedargs.tags.length > 0) {
        const tgcards = await fetchTaggedCards(parsedargs.tags)
        cards = cards.filter(x => tgcards.includes(x.id))
    }

    if(parsedargs.antitags.length > 0) {
        const tgcards = await fetchTaggedCards(parsedargs.antitags)
        cards = cards.filter(x => !tgcards.includes(x.id))
    }

    if(parsedargs.lastcard)
        cards = [ctx.cards[user.lastcard]]

    if(cards.length == 0)
        return ctx.reply(user, `no cards found matching \`${args.join(' ')}\``, 'red')

    cards.sort(parsedargs.sort)

    if(!parsedargs.lastcard && cards.length > 0) {
        user.lastcard = cards[0].id
        await user.save()
    }

    return callback(ctx, user, cards, parsedargs, args)
}

/**
 * Helper function to enrich the comamnd with user cards
 * @param  {Function} callback command handler
 * @return {Promise}
 */
const withMultiQuery = (callback) => async (ctx, user, ...args) => {
    const argsplit = args.join(' ').split(',').map(x => x.trim())
    const parsedargs = [], cards = []
    argsplit.map(x => parsedargs.push(parseArgs(ctx, x.split(' ').filter(y => y.length > 0), user)))

    const map = mapUserCards(ctx, user)
    try {
        await Promise.all(parsedargs.map(async (x, i) => {
            if(x.lastcard)
                cards.push(map.filter(x => x.id === user.lastcard))
            else {
                let batch = filter(map, x)

                if(x.tags.length > 0) {
                    const tgcards = await fetchTaggedCards(x.tags)
                    batch = batch.filter(x => tgcards.includes(x.id))
                }

                if(x.antitags.length > 0) {
                    const tgcards = await fetchTaggedCards(x.antitags)
                    batch = batch.filter(x => !tgcards.includes(x.id))
                }

                batch.sort(x.sort)
                cards.push(batch)
            }

            if(cards[i].length == 0)
                throw new Error(`${i + 1}`)
        }))
    } catch (e) {
        return ctx.reply(user, `no cards found in request **#${e.message}**`, 'red')
    }

    return callback(ctx, user, cards, parsedargs, args)
}

const bestMatch = cards => cards? cards.sort((a, b) => a.name.length - b.name.length)[0] : undefined

const removeRating = async (ctx, id, rating) => {
    console.log(`removing rating ${id} ${rating}`)
    const info = fetchInfo(ctx, id)
    info.ratingsum -= rating
    info.usercount--
    await info.save()
}

module.exports = Object.assign(module.exports, {
    formatName,
    equals,
    bestMatch,
    addUserCard,
    removeUserCard,
    filter,
    parseArgs,
    withCards,
    withGlobalCards,
    mapUserCards,
    withMultiQuery,
    fetchInfo,
    removeRating,
})
