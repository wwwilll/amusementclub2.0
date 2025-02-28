const {pcmd}        = require('../utils/cmd')
const Announcement  = require('../collections/announcement')
const Users         = require('../collections/user')

const {
    getHelpEmbed,
} = require("../commands/misc");

const {
    onUsersFromArgs,
    fetchOnly,
} = require('../modules/user')

const {
    byAlias,
} = require('../modules/collection')

const {
    checkGuildLoyalty,
    get_hero,
    getGuildScore,
} = require('../modules/hero')

const {
    formatName,
    addUserCard,
    removeUserCard,
    withGlobalCards,
    bestMatch,
} = require('../modules/card')

const {
    fetchInfo,
} = require("../modules/meta");

const {
    evalCard,
    evalCardFast,
} = require("../modules/eval");

const {
    numFmt,
} = require('../utils/tools')

const colors = require('../utils/colors')

pcmd(['admin'], ['sudo', 'help'], async (ctx, user, ...args) => {
    const help = ctx.audithelp.find(x => x.type === 'admin')
    const curpgn = getHelpEmbed(ctx, help, ctx.guild.prefix)

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, curpgn)
})

pcmd(['admin'], ['sudo', 'add', 'role'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        const role = newargs[0]
        if(!target.roles)
            target.roles = []

        if(!role)
            return ctx.reply(user, `this command requires role`, 'red')

        if(target.roles.find(x => x === role))
            rpl.push(`\`❌\` **${target.username}** (${target.discord_id}) already has role '${role}'`)
        else {
            target.roles.push(role)
            await target.save()
            rpl.push(`\`✅\` added role '${role}' to **${target.username}** (${target.discord_id})`)
        }
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin'], ['sudo', 'rm', 'role'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        const role = newargs[0]

        if(!role)
            return ctx.reply(user, `this command requires role`, 'red')

        if(!target.roles || !target.roles.find(x => x === role))
            rpl.push(`\`❌\` **${target.username}** (${target.discord_id}) doesn't have role role '${role}'`)
        else {
            target.roles = target.roles.filter(x => x != role)
            await target.save()
            rpl.push(`\`✅\` removed role '${role}' from **${target.username}** (${target.discord_id})`)
        }
    })

    return ctx.reply(user, rpl.join('\n'))
})


pcmd(['admin'], ['sudo', 'in', 'role'], ['sudo', 'inrole'], ['sudo', 'has', 'role'], async (ctx, user, ...args) => {
    const inRole = await Users.find({roles: {$ne: [], $in: args}}).sort('username')
    if (inRole.length === 0)
        return ctx.reply(user, `no users found in role(s) **${args.join(' or ')}**`, 'red')
    const pages = []
    inRole.map((x, i) => {
        if (i % 10 == 0) pages.push(``)
        pages[Math.floor(i/10)] += `${x.username} \`${x.discord_id}\` - ${x.roles.join(', ')}\n`
    })
    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        buttons: ['first', 'back', 'forward', 'last'],
        embed: {
            author: { name: `List of all users with the role(s) ${args.join(' or ')}` },
            color: colors.blue,
        }
    })
})

pcmd(['admin', 'mod'], ['sudo', 'award'], ['sudo', 'add', 'balance'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        const amount = parseInt(newargs[0])

        if(!amount)
            throw new Error(`this command requires award amount`)

        target.exp += amount
        await target.save()
        rpl.push(`\`✅\` added '${numFmt(amount)}' ${ctx.symbols.tomato} to **${target.username}** (${target.discord_id})`)
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin', 'mod'], ['sudo', 'add', 'vials'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        const amount = parseInt(newargs[0])

        if(!amount)
            throw new Error(`this command requires award amount`)

        target.vials += amount
        await target.save()
        rpl.push(`\`✅\` added '${numFmt(amount)}' ${ctx.symbols.vial} to **${target.username}** (${target.discord_id})`)
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin', 'mod'], ['sudo', 'add', 'lemons'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        const amount = parseInt(newargs[0])

        if(!amount)
            throw new Error(`this command requires award amount`)

        target.lemons += amount
        await target.save()
        rpl.push(`\`✅\` added '${amount}' ${ctx.symbols.lemon} to **${target.username}** (${target.discord_id})`)
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin', 'mod'], ['sudo', 'add', 'card'], withGlobalCards(async (ctx, user, cards, parsedargs, args) => {
    if(!parsedargs.ids[0])
        throw new Error(`please specify user ID`)

    var target = await fetchOnly(parsedargs.ids[0])

    if(!target)
        throw new Error(`cannot find user with that ID`)

    const card = bestMatch(cards)
    addUserCard(target, card.id)
    await target.save()

    return ctx.reply(user, `added ${formatName(card)} to **${target.username}**`)
}))

pcmd(['admin', 'mod'], ['sudo', 'remove', 'card'], withGlobalCards(async (ctx, user, cards, parsedargs, args) => {
    if(!parsedargs.ids[0])
        throw new Error(`please specify user ID`)

    var target = await fetchOnly(parsedargs.ids[0])

    if(!target)
        throw new Error(`cannot find user with that ID`)

    const card = bestMatch(cards)
    removeUserCard(ctx, target, card.id)
    await target.save()

    return ctx.reply(user, `removed ${formatName(card)} from **${target.username}**`)
}))

pcmd(['admin'], ['sudo', 'stress'], async (ctx, user, ...args) => {
    if(isNaN(args[0]))
        throw new Error(`please specify amount`)

    for(i=0; i<parseInt(args[0]); i++) {
        ctx.reply(user, `test message #${i}`)
    }
})

pcmd(['admin'], ['sudo', 'guild', 'lock'], async (ctx, user, arg1) => {
    const col = byAlias(ctx, arg1)[0]

    if(!col)
        throw new Error(`collection '${arg1}' not found`)

    ctx.guild.overridelock = col.id
    await ctx.guild.save()

    return ctx.reply(user, `current guild was override-locked to **${col.name}** collection`)
})

pcmd(['admin'], ['sudo', 'guild', 'unlock'], async (ctx, user) => {
    ctx.guild.overridelock = ''
    await ctx.guild.save()

    return ctx.reply(user, `guild override lock was removed. Guild locks (if any) will remain active`)
})

pcmd(['admin'], ['sudo', 'daily', 'reset'], async (ctx, user, ...args) => {
    const rpl = ['']

    await onUsersFromArgs(args, async (target, newargs) => {
        target.lastdaily = new Date(0)
        await target.save()
        rpl.push(`\`✅\` daily reset for **${target.username}** (${target.discord_id})`)
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin'], ['sudo', 'guild', 'herocheck'], async (ctx, user) => {
    await checkGuildLoyalty(ctx)
    return ctx.reply(user, `current guild hero check done`)
})

pcmd(['admin'], ['sudo', 'hero', 'score'], async (ctx, user, arg) => {
    const hero = await get_hero(ctx, arg)
    if(!hero)
        return ctx.reply(user, `cannot find hero with ID '${arg}'`, 'red')

    const score = await getGuildScore(ctx, ctx.guild, hero.id)
    return ctx.reply(user, `${hero.name} has **${Math.round(score)}** points in current guild`)
})

pcmd(['admin', 'mod'], ['sudo', 'sum'], withGlobalCards(async (ctx, user, cards, parsedargs, args) => {
    const card = parsedargs.isEmpty()? _.sample(cards) : bestMatch(cards)

    return ctx.reply(user, {
        image: { url: card.url },
        color: colors.blue,
        description: `summons **${formatName(card)}**!`
    })
}))

pcmd(['admin', 'mod'], ['sudo', 'reset', 'eval'], async (ctx, user, arg) => {
    const info = fetchInfo(ctx, arg)
    if (!info)
        return ctx.reply(user, 'card not found!', 'red')
    info.aucevalinfo.newaucprices = []
    info.aucevalinfo.evalprices= []
    info.aucevalinfo.auccount = 0
    info.aucevalinfo.lasttoldeval = -1
    await info.save()
    await evalCard(ctx, ctx.cards[arg])
    return ctx.reply(user, `successfully reset auction based eval for card ${formatName(ctx.cards[arg])}!`)
})

pcmd(['admin', 'mod'], ['sudo', 'eval', 'info'], withGlobalCards(async (ctx, user, cards, parsedargs, args) => {
    const info = fetchInfo(ctx, cards[0].id)
    let evalDiff
    let newEval = await evalCardFast(ctx, cards[0])
    let lastEval = info.aucevalinfo.lasttoldeval > 0? info.aucevalinfo.lasttoldeval: newEval



    if (lastEval > newEval)
        evalDiff = `-${numFmt(lastEval - newEval)}`
    else
        evalDiff = `+${numFmt(newEval - lastEval)}`

    let evalPrices = info.aucevalinfo.evalprices.length > 0? info.aucevalinfo.evalprices.join(', '): 'empty'
    let aucPrices = info.aucevalinfo.newaucprices.length > 0? info.aucevalinfo.newaucprices.join(', '): 'empty'
    let pricesEmbed = {
        author: { name: `Eval info for card ${cards[0].name}, ID: ${cards[0].id}` },
        fields: [
            {
                name: "Card Link",
                value: `${formatName(cards[0])}`,
                inline: true
            },
            {
                name: "Currently Used Eval Prices List",
                value: `${evalPrices}`
            },
            {
                name: "Current Auc Prices List",
                value: `${aucPrices}`
            },
            {
                name: "Old Eval",
                value: `${numFmt(lastEval)}`,
                inline: true
            },
            {
                name: "New Eval",
                value: `${numFmt(newEval)}`,
                inline: true
            },
            {
                name: "Eval Diff",
                value: evalDiff,
                inline: true
            }

        ],
        color: colors.green
    }

    await ctx.send(ctx.msg.channel.id, pricesEmbed)
}))

pcmd(['admin', 'mod'], ['sudo', 'eval', 'force'], withGlobalCards(async (ctx, user, cards, parsedargs, args) => {
    return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
        embed: { footer: { text: `Run \`->sudo eval info\`first to make sure you have the correct card! ` } },
        question: `**${user.username}**, do you want to force waiting auction prices into eval for ${formatName(cards[0])}?`,
        onConfirm: async (x) => {
            const info = fetchInfo(ctx, cards[0].id)
            info.aucevalinfo.newaucprices.map(x => info.aucevalinfo.evalprices.push(x))
            info.aucevalinfo.newaucprices = []
            await info.save()
            return ctx.reply(user, `all awaiting auction prices are now set for eval!`)
        }
    })
}))

pcmd(['admin'], ['sudo', 'crash'], (ctx) => {
    throw `This is a test exception`
})

pcmd(['admin'], ['sudo', 'embargo'], async (ctx, user, ...args) => {
    let lift
    const rpl = ['']
    await onUsersFromArgs(args, async (target, newargs) => {
        newargs[0] == 'lift'? lift = true: lift = false
        if(lift) {
            target.ban.embargo = false
            rpl.push(`${target.username} has been lifted`)
            await target.save()
            try {
                await ctx.direct(target, "Your embargo has been lifted, you may now return to normal bot usage. Please try to follow the rules, they can easily be found at \`->rules\`")
            } catch(e) {
                rpl.push(`\n ${target.username} doesn't allow PMs from the bot, so a message was not sent`)
            }
        } else {
            target.ban? target.ban.embargo = true: target.ban = {embargo: true}
            rpl.push(`${target.username} has been embargoed`)
            await target.save()
        }
    })

    return ctx.reply(user, rpl.join('\n'))
})

pcmd(['admin'], ['sudo', 'wip'], ['sudo', 'maintenance'], async (ctx, user, ...args) => {
    ctx.settings.wipMsg = args.length > 0? ctx.capitalMsg.join(' '): 'bot is currently under maintenance. Please check again later |ω･)ﾉ'
    ctx.settings.wip = !ctx.settings.wip

    if (!ctx.settings.wip)
        await ctx.bot.editStatus("online", { name: 'commands', type: 2})
    else
        await ctx.bot.editStatus("idle", { name: 'maintenance', type: 2})
    return ctx.reply(user, `maintenance mode is now **${ctx.settings.wip? `ENABLED` : `DISABLED`}**`)
})

pcmd(['admin'], ['sudo', 'lock', 'auc'], ['sudo', 'lock', 'aucs'], async (ctx, user, ...args) => {
    ctx.settings.aucLock = !ctx.settings.aucLock

    return ctx.reply(user, `auction lock has been **${ctx.settings.aucLock? `ENABLED` : `DISABLED`}**`)
})

pcmd(['admin'], ['sudo', 'announce'], async (ctx, user, ...args) => {
    const split = ctx.capitalMsg.join(' ').split(',')
    const title = split.shift()
    const body = split.join()

    if(!title || !body) {
        return ctx.reply(`required format: \`->sudo announce title text, body text\``, '')
    }

    const announcement = new Announcement()
    announcement.date = new Date()
    announcement.title = title
    announcement.body = body
    await announcement.save()

    return ctx.reply(user, {
        title,
        author: { name: `New announcement set` },
        description: body,
        footer: { text: `Date: ${announcement.date}` },
    })
})


pcmd(['admin'], ['sudo', 'top', 'lemons'], async (ctx, user) => {
    let allUsersWithLemons = await Users.find(
        { lemons: {$gt: 0} }, 
        { username: 1, discord_id: 1, lemons: 1 }, 
        { sort: {lemons: -1} }).lean()

    let pages = []
    allUsersWithLemons.map((x, i) => {
        if (i % 20 == 0) pages.push(``)
        pages[Math.floor(i/20)] += `${i+1}: ${x.username} \`${x.discord_id}\` - **${numFmt(Math.round(x.lemons))}**${ctx.symbols.lemon}\n`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        embed: {
            author: {name:`Showing Top Lemon Balances for ${allUsersWithLemons.length} users`}
        }
    })
})

pcmd(['admin'], ['sudo', 'top', 'tomatoes'], async (ctx, user) => {
    const allUsersWithTomatoes = await Users.find(
        { exp: {$gte: 1} }, 
        { username: 1, discord_id: 1, exp: 1 }, 
        { sort: {exp: -1} }).lean()

    let pages = []
    allUsersWithTomatoes.map((x, i) => {
        if (i % 20 == 0) pages.push(``)
        pages[Math.floor(i/20)] += `${i+1}: ${x.username} \`${x.discord_id}\` - **${numFmt(Math.round(x.exp))}**${ctx.symbols.tomato}\n`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        embed: {
            author: {name:`Showing Top Tomato Balances for ${allUsersWithTomatoes.length} users`}
        }
    })
})

pcmd(['admin'], ['sudo', 'top', 'vials'], async (ctx, user) => {
    let allUsersWithVials = await Users.find(
        { vials: {$gt: 0} }, 
        { username: 1, discord_id: 1, vials: 1 }, 
        { sort: {vials: -1} }).lean()

    let pages = []
    allUsersWithVials.map((x, i) => {
        if (i % 20 == 0) pages.push(``)
        pages[Math.floor(i/20)] += `${i+1}: ${x.username} \`${x.discord_id}\` - **${numFmt(Math.round(x.vials))}**${ctx.symbols.vial}\n`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        embed: {
            author: {name:`Showing Top Vial Balances for ${allUsersWithVials.length} users`}
        }
    })
})

pcmd(['admin'], ['sudo', 'top', 'clout'], async (ctx, user) => {
    let allUsersWithClout = await Users.find(
        { cloutedcols: {$exists: true, $ne: []} },
        { username: 1, discord_id: 1, cloutedcols: 1 }).lean()

    let pages = []
    let cloutUsers = []
    allUsersWithClout.map((x, i) => {
        let cloutAmount = 0
        x.cloutedcols.map(x=> cloutAmount += x.amount)
        cloutUsers.push({discord_id: x.discord_id, username: x.username, amount: cloutAmount})
    })

    cloutUsers.sort((a, b) => b.amount - a.amount).map((x, i) => {
        if (i % 20 == 0) pages.push(``)
        pages[Math.floor(i/20)] += `${i+1}: ${x.username} \`${x.discord_id}\`: **${x.amount}**★\n`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        embed: {
            author: {name:`Showing Top Clout for ${allUsersWithClout.length} users`}
        }
    })
})
