const _             = require('lodash')
const https         = require('https')
const msToTime      = require('pretty-ms')
const dateFormat    = require('dateformat')

const colors        = require('../utils/colors')
const {cmd, pcmd}   = require('../utils/cmd')
const {numFmt}      = require('../utils/tools')

const {
    cap,
    urlRegex,
} = require('../utils/tools')

const {
    fetchCardTags,
} = require('../modules/tag')

const {
    bestColMatch,
} = require('../modules/collection')

const {
    evalCard, 
} = require('../modules/eval')

const {
    getBooruPost, 
    getPostURL,
    setCardBooruData,
    setCardSource,
    fetchInfo,
    setSourcesFromRawData,
} = require('../modules/meta')

const {
    formatName,
    withGlobalCards,
    bestMatch,
    parseArgs,
} = require('../modules/card')

const {
    fetchOnly
} = require('../modules/user')

cmd('info', ['card', 'info'], withGlobalCards(async (ctx, user, cards, parsedargs) => {
    if(parsedargs.isEmpty())
        return ctx.qhelp(ctx, user, 'info')

    const card = bestMatch(cards)
    const price = await evalCard(ctx, card)
    const tags = await fetchCardTags(card)
    const col = bestColMatch(ctx, card.col)

    const resp = []
    const extrainfo = fetchInfo(ctx, card.id)
    const usercard = user.cards.find(x => x.id === card.id)
    const embed = { color: colors.blue, fields: [] }


    resp.push(formatName(card))
    resp.push(`Fandom: **${col.name}**`)
    resp.push(`Price: **${numFmt(price)}** ${ctx.symbols.tomato}`)

    if(extrainfo.ratingsum > 0)
        resp.push(`Average Rating: **${(extrainfo.ratingsum / extrainfo.usercount).toFixed(2)}**`)

    if(usercard && usercard.rating)
        resp.push(`Your Rating: **${usercard.rating}**`)

    if (extrainfo.ownercount > 0)
        resp.push(`Owner Count: **${numFmt(extrainfo.ownercount)}**`)

    if (extrainfo.auccount > 0)
        resp.push(`Times Auctioned: **${numFmt(extrainfo.aucevalinfo.auccount)}**`)

    resp.push(`ID: ${card.id}`)
    embed.description = resp.join('\n')

    if(tags && tags.length > 0) {
        embed.fields.push({
            name: `Tags`, 
            value: `#${tags.slice(0, 3).map(x => x.name).join('\n#')}`,
            inline: true,
        })
    }

    if(extrainfo.meta) {
        const meta = []
        if(extrainfo.meta.booruid) {
            meta.push(`Rating: **${extrainfo.meta.boorurating}**`)
            meta.push(`Artist: **${extrainfo.meta.artist}**`)
            meta.push(`[Danbooru page](https://danbooru.donmai.us/posts/${extrainfo.meta.booruid})`)
        }

        if(extrainfo.meta.author) {
            const cardAuthor = await fetchOnly(extrainfo.meta.author)
            meta.push(`Card by: **${cardAuthor.username}**`)
        }

        if(extrainfo.meta.added)
            meta.push(`Added: **${dateFormat(extrainfo.meta.added, "yyyy-mm-dd")}** (${msToTime(new Date() - extrainfo.meta.added, {compact: true})})`)

        if(meta.length > 0) {
            embed.fields.push({
                name: `Metadata`, 
                value: meta.join('\n'),
                inline: true,
            })
        }
    }
    
    if(extrainfo.meta.source || card.imgur) {
        const sourceList = []

        if(card.imgur)
            sourceList.push(`[Full card on Imgur](${card.imgur})`)

        if(extrainfo.meta.source) {
            if(extrainfo.meta.source.match(urlRegex)) {
                sourceList.push(`[Image origin](${extrainfo.meta.source})`)
            } else {
                sourceList.push(`This card is a screen capture from anime or game`)
            }
        }

        if(extrainfo.meta.image)
            sourceList.push(`[Source image](${extrainfo.meta.image})`)
        
        if(extrainfo.meta.contributor) {
            const contributor = await fetchOnly(extrainfo.meta.contributor)
            if(contributor) {
                sourceList.push(`Researched by: **${contributor.username}**`)
            }
        }

        if(sourceList.length > 0) {
            embed.fields.push({
                name: `Links`, 
                value: sourceList.join('\n'),
            })
        }
    }

    return ctx.send(ctx.msg.channel.id, embed, user.discord_id)

})).access('dm')

pcmd(['admin', 'mod', 'metamod'], ['meta', 'set', 'booru'], withGlobalCards(async (ctx, user, cards, parsedargs) => {
    const booruID = parsedargs.extra[0]
    if(isNaN(booruID)) {
        return ctx.reply(user, `booru ID should be a number and specified as \`:1234567\``, 'red')
    }

    const post = await getBooruPost(ctx, booruID)
    if(!post) {
        return ctx.reply(user, `cannot find post with ID ${booruID}`, 'red')
    }

    const properties = []
    post.source = post.pixiv_id? `https://www.pixiv.net/en/artworks/${post.pixiv_id}` : post.source

    properties.push(`Source: ${post.source}`)
    properties.push(`Artist: **${post.tag_string_artist}**`)
    properties.push(`Characters: **${post.tag_count_character}**`)
    properties.push(`Copyrights: **${post.tag_count_copyright}**`)
    properties.push(`Tags: **${post.tag_count_general}**`)
    properties.push(`Pixiv ID: **${post.pixiv_id}**`)

    const card = bestMatch(cards)
    return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
        question: `Do you want to add this booru source to ${formatName(card)}?
            This will add the following properties to the card metadata`,
        embed: { 
            fields: [
                {
                    name: "Properties", 
                    value: properties.join('\n'),
                }
            ],
            footer: { text: `Booru ID: ${booruID}` },
            image: { url: getPostURL(post) }
        },
        onConfirm: async (x) => {
            try {
                await setCardBooruData(ctx, user, card.id, post)
                return ctx.reply(user, `sources and tags have been saved!`)

            } catch(e) {
                return ctx.reply(user, `unexpected error occured while trying to add card booru data. Please try again.
                    ${e.message}`, 'red')
            }
        },
    })
}))

pcmd(['admin', 'mod', 'metamod'], ['meta', 'guess', 'booru'], withGlobalCards(async (ctx, user, cards, parsedargs) => {
    
    if(parsedargs.isEmpty()) {
        return ctx.reply(user, `please specify card`, 'red')
    }
    
    let booruID = ""
    const targetLink = parsedargs.extra[0]
    if(!targetLink || !targetLink.match(urlRegex)) {
        return ctx.reply(user, `please specify image url as \`:https://www.pixiv.net/en/artworks/1234567.jpg\``, 'red')
    }

    try {
        if(!ctx.sauce) {
            return ctx.reply(user, `SauceNao token is not set`, 'red')
        }

        const found = await ctx.sauce(targetLink)

        if(found.length == 0 || found[0].similarity < 85) {
            return ctx.reply(user, `guess failed. No matches found`, 'red')
        }

        booruID = found[0].url.split('/')[5]
        
    } catch (e) {
        return ctx.reply(user, `guess failed. ${e.message}`, 'red')
    }

    if(!booruID || isNaN(booruID)) {
        return ctx.reply(user, `guess failed. No valid danbooru ID was returned`, 'red')
    }

    const post = await getBooruPost(ctx, booruID)
    if(!post) {
        return ctx.reply(user, `guess failed. Cannot find post with ID ${booruID}`, 'red')
    }

    const properties = []
    post.source = post.pixiv_id? `https://www.pixiv.net/en/artworks/${post.pixiv_id}` : post.source

    properties.push(`Source: ${post.source}`)
    properties.push(`Artist: **${post.tag_string_artist}**`)
    properties.push(`Characters: **${post.tag_count_character}**`)
    properties.push(`Copyrights: **${post.tag_count_copyright}**`)
    properties.push(`Tags: **${post.tag_count_general}**`)
    properties.push(`Pixiv ID: **${post.pixiv_id}**`)

    const card = bestMatch(cards)
    return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
        question: `Do you want to add this booru source to ${formatName(card)}?
            This will add the following properties to the card metadata`,
        embed: { 
            fields: [
                {
                    name: "Properties", 
                    value: properties.join('\n'),
                }
            ],
            footer: { text: `Booru ID: ${booruID}` },
            image: { url: getPostURL(post) }
        },
        onConfirm: async (x) => {
            try {
                await setCardBooruData(ctx, user, card.id, post)
                return ctx.reply(user, `sources and tags have been saved!`)

            } catch(e) {
                return ctx.reply(user, `unexpected error occured while trying to add card booru data. Please try again.
                    ${e.message}`, 'red')
            }
        },
    })
}))

pcmd(['admin', 'mod', 'metamod'], ['meta', 'set', 'source'], withGlobalCards(async (ctx, user, cards, parsedargs, ...args) => {
    const url = ctx.capitalMsg.find(x => x[0] == ':').substring(1)
    if(!url) {
        return ctx.reply(user, `please specify the url to the card source as \`:https://www.pixiv.net/en/artworks/80848641\``, 'red')
    }

    const card = bestMatch(cards)
    const info = ctx.cardInfos[card.id]
    if(info && info.meta && info.meta.source && !ctx.globals.force) {
        return ctx.reply(user, `this card already has a [source](${info.meta.source}) set.
        You can force source override by adding \`-f\` to the command`, 'red')
    }

    await setCardSource(ctx, user, card.id, url)

    return ctx.reply(user, `successfully set source image for ${formatName(card)}`)
}))

pcmd(['admin', 'mod', 'metamod'], ['meta', 'scan', 'source'], async (ctx, user, ...args) => {
    https.get(ctx.msg.attachments[0].url, res => {
        const parsedArgs = parseArgs(ctx, args, user)
        const authorID = parsedArgs.extra[0]
        const colArg = args.find(x => x[0] == '-').replace('-', '')

        if (!colArg) {
            return ctx.reply(user, `please specify collection`, 'red')
        }

        const col = bestColMatch(ctx, colArg)

        if (!col) {
            return ctx.reply(user, `collection with name \`${colArg}\` was no found`, 'red')
        }

        res.setEncoding('utf8')

        let rawData = ''
        res.on('data', (chunk) => { rawData += chunk })
        res.on('end', async () => {
            try {
                const res = await setSourcesFromRawData(ctx, rawData, col, authorID)
                if(res.problems.length > 0) {
                    ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
                        pages: ctx.pgn.getPages(res.problems, 10),
                        embed: {
                            author: { name: `Following cards were not found:` },
                            color: colors.yellow,
                        },
                    })
                }

                const resp = []
                resp.push(`successfully set sources for **${res.count}** cards.`)

                if (authorID) {
                    const authorUser = await fetchOnly(authorID)
                    resp.push(`Set **${authorUser? authorUser.username : 'undefined'}** as card author.`)
                }
                
                return ctx.reply(user, resp.join('\n'))

            } catch (e) {
                return ctx.reply(user, `an error occurred while scanning the sources:
                    ${e.message}`, 'red')
            }
        });
    })
})

pcmd(['admin', 'mod', 'metamod'], ['meta', 'list', 'sourced'], withGlobalCards(async (ctx, user, cards, parsedargs) => {
    const sourcedCards = cards.map(x => {
        x.info = ctx.cardInfos[x.id]
        return x
    }).filter(x => x.info && x.info.meta && x.info.meta.source)

    const names = sourcedCards
    .map(c => {
        const rarity = new Array(c.level + 1).join('★')
        return `[${rarity}] [${cap(c.name.replace(/_/g, ' '))}](${c.shorturl}) \`[${c.col}]\` [source](${c.info.meta.source})`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages: ctx.pgn.getPages(names, 10),
        embed: {
            author: { name: `Found sourced ${names.length} / ${cards.length} overall` },
        }
    })
}))

pcmd(['admin', 'mod', 'metamod'], ['meta', 'list', 'unsourced'], withGlobalCards(async (ctx, user, cards, parsedargs) => {
    cards = cards.filter(x => !ctx.cardInfos[x.id] || 
        !ctx.cardInfos[x.id].meta || 
        !ctx.cardInfos[x.id].meta.source)

    const names = cards.map(c => {
        const rarity = new Array(c.level + 1).join('★')
        return `[${rarity}] [${cap(c.name.replace(/_/g, ' '))}](${c.url}) \`[${c.col}]\``
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages: ctx.pgn.getPages(names, 10),
        embed: {
            author: { name: `Found ${cards.length} without sources` },
        }
    })
}))
