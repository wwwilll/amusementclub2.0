const User      = require('../collections/user')
const _         = require('lodash')
const asdate    = require('add-subtract-date')
const colors    = require('../utils/colors')

const {
    getAllUserIDs,
    XPtoLEVEL,
} = require('../utils/tools')

const fetchOrCreate = async (ctx, userid, username) => {
    let user = await User.findOne({ discord_id: userid })

    if (!user) {
        user = new User()
        user.username = username
        user.discord_id = userid
        user.exp = 3000
        user.vials = 100
        user.joined = new Date()
        user.lastdaily = asdate.subtract(new Date(), 1, 'day')

        /* save, and send welcome msg */
        await user.save()

        await ctx.send(ctx.msg.channel.id, {
            color: colors.blue,
            author: { name: `Welcome to Amusement Club!` },
            description: `You are now part of the community card collecting game. Check your \`${ctx.prefix}todo\` list to get started.`,
            fields:[
                {
                    name: `What should you do?`,
                    value: `Claim your first batch of cards using \`${ctx.prefix}claim 4\`. It is recommended to claim 4-6 cards per day.
                        Use \`${ctx.prefix}daily\` to reset your claim price. Now you can \`${ctx.prefix}claim\` more cards!
                        Check out your \`${ctx.prefix}quests\` that you get every time you claim daily.`
                },
                {
                    name: `Moving forward`,
                    value: `View cards you claimed with \`${ctx.prefix}cards\`. You can \`${ctx.prefix}summon\` **any card that you own**.
                        Don't forget to \`${ctx.prefix}fav\` your favourites!
                        Once you get enough ${ctx.symbols.tomato} or ${ctx.symbols.lemon} check out \`${ctx.prefix}store\` and try buildings and effects.`
                },
                {
                    name: `More information`,
                    value: `Use \`${ctx.prefix}help\` to get help about any command. For example, \`${ctx.prefix}help forge\` will give you all information about forge.
                        Also check out our [how to play guide](https://docs.amusement.cafe/en/getting-started/howto-play) and [online documentation](https://docs.amusement.cafe/).
                        Join the [support server](${ctx.cafe}) to ask any questions.`
                }
            ]
        }, user.discord_id)
    }

    if(user.username != username) {
        user.username = username
        await user.save()
    }

    return user
}

const fetchOnly = (userid) => {
    return User.findOne({ discord_id: userid })
}

const updateUser = (user, query) => {
    return User.findOneAndUpdate({discord_id: user.discord_id}, query, { returnNewDocument: true })
}

const onUsersFromArgs = async (args, callback) => {
    const pa = getAllUserIDs(args)

    if(pa.ids.length === 0)
        throw new Error(`please specify at least one user ID`)

    await Promise.all(pa.ids.map(async x => {
       const target = await fetchOnly(x) 
       await callback(target, pa.args)
    }))
}

const getQuest = (ctx, user, tier, exclude) => {
    const level = XPtoLEVEL(user.xp)
    const available = ctx.quests.daily.filter(x => 
        (!exclude || x.id.slice(0,-1) != exclude)
        && x.tier === tier
        && x.min_level <= level
        && x.can_drop)

    if(available.length > 0) {
        return _.sample(available)
    }
    
    return _.sample(ctx.quests.daily.filter(x => 
        x.id != exclude
    ))
}

module.exports = {
    fetchOrCreate,
    fetchOnly,
    onUsersFromArgs,
    updateUser,
    getQuest
}
