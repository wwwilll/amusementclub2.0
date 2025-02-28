const {cmd, pcmd}   = require('../utils/cmd')
const Plots         = require('../collections/plot')
const colors        = require('../utils/colors')
const _             = require('lodash')
const dateFormat    = require(`dateformat`)
const asdate        = require('add-subtract-date')
const mstotime      = require('pretty-ms')


const {
    numFmt,
    XPtoLEVEL,
}   = require('../utils/tools')


const {
    getUserPlots,
    getLemonCap,
    getMaxStorage,
    plotCost,
}   = require('../modules/plot')

cmd(['plot'], ['plots'], async (ctx, user) => {
    const lots = await getUserPlots(ctx)
    if (lots.length === 0 )
        return ctx.reply(user, `you have no plots in this guild! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')
    let pages = []

    lots.map((x, i) => {
        if (i % 10 == 0) pages.push("`Plot # | Building | Level | Revenue`\n")
        let buildingName = x.building.id? x.building.id.padEnd(8) : 'None    '
        let level = x.building.id? x.building.level.toString().padEnd(5) : 'N/A  '
        let lemons = x.building.id? `${numFmt(x.building.stored_lemons)} 🍋`: 'N/A'
        pages[Math.floor(i/10)] += `\`${(i+1).toString().padEnd(6)} | ${buildingName} | ${level} | ${lemons}\`\n`
    })

    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        buttons: ['back', 'forward'],
        embed: {
            author: { name: `${user.username}, you have ${lots.length} plots in this guild` },
            color: colors.blue,
        }
    })
})

cmd(['plot', 'global'], ['plots', 'global'], async (ctx, user) => {
    const lots = await getUserPlots(ctx, true)
    lots.sort((a, b) => a.guild_id - b.guild_id)
    let pages = []

    if (lots.length === 0)
        return ctx.reply(user, `you have no plots! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')

    lots.map((x, i) => {
        if (i % 10 == 0) pages.push("`Plot # | Building | Level | Lemons | Guild Name`\n")
        let buildingName = x.building.id? x.building.id.padEnd(8) : 'None    '
        let level = x.building.id? x.building.level.toString().padEnd(5) : 'N/A  '
        let lemons = x.building.id? `${numFmt(x.building.stored_lemons)}`.padEnd(6): 'N/A   '
        pages[Math.floor(i/10)] += `\`${(i+1).toString().padEnd(6)} | ${buildingName} | ${level} | ${lemons} | ${x.guild_name}\`\n`
    })
    return ctx.pgn.addPagination(user.discord_id, ctx.msg.channel.id, {
        pages,
        buttons: ['back', 'forward'],
        embed: {
            author: { name: `${user.username}, you have ${lots.length} plots globally` },
            color: colors.blue,
        }
    })
})

cmd(['plot', 'buy'], async (ctx, user) => {
    const maxGuildAmount = Math.round(XPtoLEVEL(ctx.guild.xp) / 8) + 1
    const maxUserAmount = Math.floor(XPtoLEVEL(user.xp) / 20) === 0? 0 : Math.floor((XPtoLEVEL(user.xp) - 20) / 10) + 1
    const userGlobalPlots = await getUserPlots(ctx, true)
    const userGuildPlots = userGlobalPlots.filter(x => x.guild_id === ctx.guild.id)
    const cost = await plotCost(ctx)
    const buildingCount = ctx.items.filter(x => x.type === 'blueprint').length

    const check = async () => {

        if (maxUserAmount === 0)
            return ctx.reply(user, `you can start using plots once you reach level **20**!\nGain levels by playing the bot normally and use \`${ctx.prefix}profile\` to see what level you are!`, 'red')

        if (userGuildPlots.length >= maxGuildAmount)
            return ctx.reply(user, 'you have the maximum amount of plots available for this guild!\nWait for the guild level to raise to get more!', 'red')

        if (userGlobalPlots.length >= maxUserAmount)
            return ctx.reply(user, `you have the maximum amount of plots available globally!\nUse the bot and gain \`${ctx.guild.prefix}profile\` levels to be able to buy more!\nA new plot is unlocked every **10** levels after you reach level 20.`, 'red')

        if (user.lemons < cost)
            return ctx.reply(user, `you don't have enough lemons to afford this plot!\nYou need **${numFmt(cost)}** ${ctx.symbols.lemon} to purchase another plot!`, 'red')
    }

    let question = `Would you like to purchase a plot in **${ctx.msg.channel.guild.name}**? It will cost you **${numFmt(cost)}** ${ctx.symbols.lemon}!`

    if (userGuildPlots.length >= buildingCount)
        question += `\n**Note that there are currently only ${buildingCount} buildings available at this time and you cannot have two of the same building in a guild!**`

    return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
        question,
        force: ctx.globals.force,
        check,
        onConfirm: async () => {
            let newLot = new Plots
            newLot.user_id = ctx.msg.author.id
            newLot.guild_id = ctx.guild.id
            newLot.guild_name = ctx.discord_guild.name
            await newLot.save()
            user.lemons -= cost
            await user.save()
            ctx.guild.lemons += cost
            await ctx.guild.save()

            let affordablePlots = 1
            while(25 * (2 ** (userGlobalPlots.length + affordablePlots)) < user.lemons)
                affordablePlots++

            let guildAllowedPlots = maxGuildAmount - (userGuildPlots.length + 1)
            let userAllowedPlots = maxUserAmount - (userGlobalPlots.length + 1)

            let buyablePlots = _.min([affordablePlots - 1, userAllowedPlots, guildAllowedPlots])

            ctx.reply(user, `you have bought a plot for **${numFmt(cost)}** ${ctx.symbols.lemon} in **${ctx.msg.channel.guild.name}**!
            You are currently able to buy **${buyablePlots}** more plots in this guild!`)
        },
    })
})

cmd(['plot', 'upgrade'], async (ctx, user, arg) => {
    if (!arg)
        return ctx.reply(user, 'please specify a plot number to upgrade!', 'red')

    let plot = await getUserPlots(ctx, false, arg)

    if (plot.length === 0)
        plot = await getUserPlots(ctx, false)

    if (arg - 1 > plot.length)
        return ctx.reply(user, `no plot found in position ${arg}!`, 'red')

    plot = plot[arg - 1] || plot[0]

    if (!plot || !plot.building.id)
        return ctx.reply(user, `no plots found with a building with the argument **${arg}**!`, 'red')

    const item = ctx.items.find(x => x.id === plot.building.id)
    const level = item.levels[plot.building.level]
    const userLvl = XPtoLEVEL(user.xp)

    if(!level)
        return ctx.reply(user, `**${item.name}** is already max level`, 'red')

    if(userLvl < level.level)
        return ctx.reply(user, `you need to be level ${level.level} to upgrade this building! See your level in \`${ctx.guild.prefix}profile\``, 'red')

    if(user.lemons < level.price)
        return ctx.reply(user, `you have to have at least **${numFmt(level.price)}** ${ctx.symbols.lemon} to upgrade this building`, 'red')

    const question = `Do you want to upgrade **${item.name}** to level **${plot.building.level + 1}** for **${numFmt(level.price)}** ${ctx.symbols.lemon}?`

    return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
        question,
        force: ctx.globals.force,
        onConfirm: async (x) => {
            plot.building.level++
            user.lemons -= level.price
            await user.save()
            await plot.save()

            ctx.mixpanel.track(
                "Building Upgrade", {
                    distinct_id: user.discord_id,
                    building_id: item.id,
                    building_level: plot.building.level,
                    price: level.price,
                    guild: ctx.guild.id,
                })

            return ctx.reply(user, `you successfully upgraded **${item.name}** to level **${plot.building.level}**!
                This building now *${level.desc.toLowerCase()}*`)

        },
    })
})

cmd(['plot', 'info'], ['plot', 'status'], async (ctx, user, arg) => {
    if (!arg)
        return ctx.reply(user, 'please specify a plot number to see info on!', 'red')

    let plot = await getUserPlots(ctx, false)
    let plotLength = plot.length

    if (plot.length === 0)
        return ctx.reply(user, `you have no plots in this guild! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')

    let plotArg = arg - 1
    plot = plot[plotArg]
    if(!plot)
        return ctx.reply(user, `you don't have a plot in position ${arg}, you only have ${plotLength} plots in this guild!`, 'red')

    if(!plot.building.id)
        return ctx.reply(user, `this is an empty plot! You can buy buildings from the \`${ctx.guild.prefix}store\` and place them on this plot!`)

    const item = ctx.items.find(x => x.id === plot.building.id)

    const embed = {
        author: { name: `${user.username}, here are the stats for your ${item.name}` },
        fields: [
            {
                name: `Stored Revenue`,
                value: `${numFmt(plot.building.stored_lemons)} ${ctx.symbols.lemon} (Max: ${await getMaxStorage(ctx, plot)} ${ctx.symbols.lemon})`,
                inline: true
            },
            {
                name: `Installation Date`,
                value: `${dateFormat(plot.building.install_date, "yyyy-mm-dd HH:MM:ss Z", true)}`,
                inline: true
            },
            {
                name: `Last Collected Date`,
                value: `${dateFormat(plot.building.last_collected, "yyyy-mm-dd HH:MM:ss Z", true)}`,
                inline: true
            },
        ],
        color: colors.blue,
        footer: {text: dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss Z", true)}

    }

    let level = item.levels.map((x, i) => ({
        name: `Level ${i + 1}`,
        value: `Price: **${numFmt(x.price)}** ${ctx.symbols.lemon}
                Level Requirement: **${x.level}**
                > ${x.desc.replace(/{currency}/gi, ctx.symbols.lemon)}`
    }))
    level[plot.building.level - 1].name += ` (Current Level)`
    level.map(x => embed.fields.push(x))


    return ctx.send(ctx.msg.channel.id, embed, user.discord_id)
})

cmd(['plot', 'info', 'global'], ['plot', 'status', 'global'], async (ctx, user, arg) => {
    if (!arg)
        return ctx.reply(user, 'please specify a plot number to see info on!', 'red')

    let plot = await getUserPlots(ctx, true)
    let plotLength = plot.length

    if (plotLength === 0)
        return ctx.reply(user, `You have no plots! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')

    plot.sort((a, b) => a.guild_id - b.guild_id)
    let plotArg = arg - 1
    plot = plot[plotArg]
    if(!plot)
        return ctx.reply(user, `you don't have a plot in position ${arg}, you only have ${plotLength} plots globally!`, 'red')

    if(!plot.building.id)
        return ctx.reply(user, `this is an empty plot! You can buy buildings from the \`${ctx.guild.prefix}store\` and place them on this plot!`)

    const item = ctx.items.find(x => x.id === plot.building.id)

    const embed = {
        author: { name: `${user.username}, here are the stats for your ${item.name}` },
        fields: [
            {
                name: `Stored Revenue`,
                value: `${numFmt(plot.building.stored_lemons)} ${ctx.symbols.lemon} (Max: ${await getMaxStorage(ctx, plot, plot.guild_id)} ${ctx.symbols.lemon})`,
                inline: true
            },
            {
                name: `Installation Date`,
                value: `${dateFormat(plot.building.install_date, "yyyy-mm-dd HH:MM:ss Z", true)}`,
                inline: true
            },
            {
                name: `Last Collected Date`,
                value: `${dateFormat(plot.building.last_collected, "yyyy-mm-dd HH:MM:ss Z", true)}`,
                inline: true
            },
        ],
        color: colors.blue,
    }

    let level = item.levels.map((x, i) => ({
        name: `Level ${i + 1}`,
        value: `Price: **${numFmt(x.price)}** ${ctx.symbols.lemon}
                Level Requirement: **${x.level}**
                > ${x.desc.replace(/{currency}/gi, ctx.symbols.lemon)}`
    }))
    level[plot.building.level - 1].name += ` (Current Level)`
    level.map(x => embed.fields.push(x))


    return ctx.send(ctx.msg.channel.id, embed, user.discord_id)
})

cmd(['plot', 'collect'], ['plots', 'collect'], ['plot', 'claim'], ['plots', 'claim'], async (ctx, user) => {
    const past = asdate.subtract(new Date(), 1, "hours")
    let plots = await getUserPlots(ctx)
    let cap = await getLemonCap(ctx)

    if (plots.length === 0)
        return ctx.reply(user, `you don't have any plots in this guild! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')
    
    let lastCollected = plots[0].building.last_collected
    plots = plots.filter(x=> x.building)

    if (lastCollected > past)
        return ctx.reply(user, `you have no plots in this guild that are ready for collection!\nYou can next collect from plots here in **${mstotime(lastCollected - past)}**.`, 'red')

    let collection = 0

    plots.map(async y => {
        if (y.building.stored_lemons > 0)
            collection += y.building.stored_lemons
    })
    let forfeit = (collection + user.lemons) - cap

    if (collection + user.lemons > cap)
        return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
            question: `You are about to collect **${numFmt(collection)}** ${ctx.symbols.lemon} which brings you above your lemon limit of **${numFmt(cap)}**! Collecting now will forfeit **${numFmt(forfeit)}** ${ctx.symbols.lemon}
            Do you want to continue?`,
            onConfirm: async () => {
                plots.map(async y => {
                    y.building.stored_lemons = 0
                    y.building.last_collected = new Date()
                    await y.save()
                })
                user.lemons = cap
                await user.save()
                return ctx.reply(user, `you have successfully collected **${numFmt(collection - forfeit)}** ${ctx.symbols.lemon} from this guild, forfeiting **${numFmt(forfeit)}**! 
                You now have **${numFmt(user.lemons)}** ${ctx.symbols.lemon}`)
            }
        })
    plots.map(async y => {
        y.building.stored_lemons = 0
        y.building.last_collected = new Date()
        await y.save()
    })
    user.lemons += collection
    await user.save()
    return ctx.reply(user, `you have successfully collected **${numFmt(collection)}** ${ctx.symbols.lemon} from this guild! 
            You now have **${numFmt(user.lemons)}** ${ctx.symbols.lemon}`)
})

cmd(['plot', 'demolish'], ['plot', 'delete'], ['plot', 'remove'], ['plot', 'destroy'], async (ctx, user, arg) => {
    if (!arg)
        return ctx.reply(user, 'please specify a plot number to demolish!', 'red')

    let plots = await getUserPlots(ctx, false)
    let plotLength = plots.length

    if (plotLength === 0)
        return ctx.reply(user, `You have no plots! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')

    let plotArg = arg - 1
    let plot = plots[plotArg]
    if(!plot)
        return ctx.reply(user, `you don't have a plot in position \`${arg}\`, you only have **${plotLength}** plots in this guild!`, 'red')

    let question

    if(!plot.building.id) {
        question = `You are about to delete an empty plot, you will not get any lemons back for this action. Do you wish to continue?`
        return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
            question,
            onConfirm: async () => {
                await Plots.deleteOne({guild_id: plot.guild_id, user_id: user.discord_id, building: {$eq: null}})
                return ctx.reply(user, `you have deleted an empty plot, you now have ${plotLength - 1} plot(s) total!`)
            }
        })
    } else {
        plots = plots.filter(x => x.building.id)
        if (plots.length > 1 && plot.building.id === 'castle') {
            return ctx.reply(user, `you cannot delete this plot as it has a castle on it and you have other plots with buildings in the guild.`, `red`)
        }
        const item = ctx.items.find(x => x.id === plot.building.id)
        const levelPrices = item.levels.map(x => x.price).slice(0, plot.building.level)
        const refund = levelPrices.length === 0? Math.floor(item.price * 0.75): Math.floor((levelPrices.reduce((a, b) => a + b) + item.price) * 0.75)

        question = `You are about to demolish your \`${plot.building.id}\` in ${plot.guild_name}. You will get **${(numFmt(refund))}** ${ctx.symbols.lemon} back. Do you want to continue?`
        return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
            question,
            onConfirm: async () => {
                await Plots.deleteOne({guild_id: plot.guild_id, user_id: user.discord_id, "building.id": plot.building.id})
                user.lemons += refund
                await user.save()
                return ctx.reply(user, `you have demolished your ${plot.building.id} in ${plot.guild_name}. You have received **${numFmt(refund)}** ${ctx.symbols.lemon} back.`)
            }
        })
    }
})

cmd(['plot', 'demolish', 'global'], ['plot', 'delete', 'global'], ['plot', 'remove', 'global'], ['plot', 'destroy', 'global'], async (ctx, user, arg) => {
    if (!arg)
        return ctx.reply(user, 'please specify a plot number to demolish!', 'red')

    let plots = await getUserPlots(ctx, true)
    let plotLength = plots.length

    if (plotLength === 0)
        return ctx.reply(user, `You have no plots! Start with \`${ctx.prefix}plot buy\` and \`${ctx.prefix}help plot\` for more!`, 'red')

    plots.sort((a, b) => a.guild_id - b.guild_id)
    let plotArg = arg - 1
    let plot = plots[plotArg]
    if(!plot)
        return ctx.reply(user, `you don't have a plot in position \`${arg}\`, you only have **${plotLength}** plots globally!`, 'red')

    let question

    if(!plot.building.id) {
        question = `You are about to delete an empty plot in ${plot.guild_name}, you will not get any lemons back for this action. Do you wish to continue?`
        return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
            question,
            onConfirm: async () => {
                await Plots.deleteOne({guild_id: plot.guild_id, user_id: user.discord_id, building: {$eq: null}})
                return ctx.reply(user, `you have deleted an empty plot in ${plot.guild_name}, you now have ${plotLength - 1} plot(s) total!`)
            }
        })
    } else {
        plots = plots.filter(x => x.guild_id === plot.guild_id && x.building.id)
        if (plots.length > 1 && plot.building.id === 'castle') {
            return ctx.reply(user, `you cannot delete this plot as it has a castle on it and you have other plots with buildings in ${plot.guild_name}.`, `red`)
        }
        const item = ctx.items.find(x => x.id === plot.building.id)
        const levelPrices = item.levels.map(x => x.price).slice(0, plot.building.level)
        const refund = levelPrices.length === 0? Math.floor(item.price * 0.75): Math.floor((levelPrices.reduce((a, b) => a + b) + item.price) * 0.75)

        question = `You are about to demolish your \`${plot.building.id}\` in ${plot.guild_name}. You will get **${(numFmt(refund))}** ${ctx.symbols.lemon} back. Do you want to continue?`
        return ctx.pgn.addConfirmation(user.discord_id, ctx.msg.channel.id, {
            question,
            onConfirm: async () => {
                await Plots.deleteOne({guild_id: plot.guild_id, user_id: user.discord_id, "building.id": plot.building.id})
                user.lemons += refund
                await user.save()
                return ctx.reply(user, `you have demolished your ${plot.building.id} in ${plot.guild_name}. You have received **${numFmt(refund)}** ${ctx.symbols.lemon} back.`)
            }
        })
    }
})
