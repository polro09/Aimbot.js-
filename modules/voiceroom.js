// modules/voiceroom.js - 보이스룸 모듈
const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
  } = require('discord.js');
  const config = require('../config/bot-config');
  const logger = require('../logger');
  const path = require('path');
  const fs = require('fs');
  
  /**
   * 보이스룸 관리 모듈
   * @param {Client} client 디스코드 클라이언트
   * @returns {Object} 모듈 객체
   */
  module.exports = (client) => {
    // 데이터 파일 경로
    const dataFolder = path.join(__dirname, '..', 'data');
    const voiceDataPath = path.join(dataFolder, 'voicerooms.json');
    
    // 음성 채널 생성 데이터 (서버ID -> 설정)
    const voiceData = {};
    
    // 현재 생성된 음성 채널 추적 (채널ID -> 생성자ID)
    const activeVoiceRooms = new Map();
    
    // 슬래시 커맨드 정의
    const slashCommands = [
      new SlashCommandBuilder()
        .setName('보이스룸')
        .setDescription('보이스룸 기능을 설정합니다')
        .addSubcommand(subcommand =>
          subcommand
            .setName('카테고리지정')
            .setDescription('보이스룸이 생성될 카테고리를 지정합니다')
            .addChannelOption(option =>
              option.setName('카테고리')
                .setDescription('보이스룸이 생성될 카테고리를 선택해주세요')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('통화방지정')
            .setDescription('보이스룸 생성을 위한 통화방을 지정합니다')
            .addChannelOption(option =>
              option.setName('채널')
                .setDescription('보이스룸 생성을 위한 통화방을 선택해주세요')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('설정확인')
            .setDescription('현재 보이스룸 설정을 확인합니다')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
    ];
    
    /**
     * 모듈 초기화
     */
    function initialize() {
      try {
        // 데이터 폴더 확인 및 생성
        if (!fs.existsSync(dataFolder)) {
          fs.mkdirSync(dataFolder, { recursive: true });
        }
        
        // 데이터 파일 로드
        loadVoiceData();
        
        // 이벤트 리스너 등록
        client.on('voiceStateUpdate', handleVoiceStateUpdate);
        
        logger.module('VoiceRoom', '보이스룸 모듈이 초기화되었습니다.');
      } catch (error) {
        logger.error('VoiceRoom', `초기화 중 오류 발생: ${error.message}`);
      }
    }
    
    /**
     * 음성 데이터 로드
     */
    function loadVoiceData() {
      try {
        if (fs.existsSync(voiceDataPath)) {
          const data = fs.readFileSync(voiceDataPath, 'utf8');
          Object.assign(voiceData, JSON.parse(data));
          logger.info('VoiceRoom', '보이스룸 데이터를 로드했습니다.');
        } else {
          // 파일이 없으면 기본 데이터로 저장
          saveVoiceData();
        }
      } catch (error) {
        logger.error('VoiceRoom', `데이터 로드 중 오류 발생: ${error.message}`);
      }
    }
    
    /**
     * 음성 데이터 저장
     */
    function saveVoiceData() {
      try {
        fs.writeFileSync(voiceDataPath, JSON.stringify(voiceData, null, 2), 'utf8');
        logger.info('VoiceRoom', '보이스룸 데이터를 저장했습니다.');
      } catch (error) {
        logger.error('VoiceRoom', `데이터 저장 중 오류 발생: ${error.message}`);
      }
    }
/**
   * 음성 상태 변경 이벤트 처리
   * @param {VoiceState} oldState 이전 음성 상태
   * @param {VoiceState} newState 새 음성 상태
   */
async function handleVoiceStateUpdate(oldState, newState) {
    try {
      // 서버 ID 가져오기
      const guildId = newState.guild.id;
      
      // 서버 설정이 없으면 무시
      if (!voiceData[guildId]) return;
      
      const { categoryId, lobbyId } = voiceData[guildId];
      
      // 필수 설정이 없으면 무시
      if (!categoryId || !lobbyId) return;
      
      // 사용자가 로비 채널에 입장한 경우
      if (newState.channelId === lobbyId && (!oldState.channelId || oldState.channelId !== lobbyId)) {
        await createCustomVoiceChannel(newState);
      }
      
      // 생성된 보이스룸이 비어있는지 확인하고 정리
      cleanupEmptyVoiceRooms(oldState);
    } catch (error) {
      logger.error('VoiceRoom', `음성 이벤트 처리 중 오류 발생: ${error.message}`);
    }
  }
  
  /**
   * 커스텀 음성 채널 생성
   * @param {VoiceState} voiceState 음성 상태
   */
  async function createCustomVoiceChannel(voiceState) {
    try {
      const { guild, member, channel } = voiceState;
      const guildId = guild.id;
      const settings = voiceData[guildId];
      
      // 카테고리 가져오기
      const category = guild.channels.cache.get(settings.categoryId);
      if (!category) {
        logger.error('VoiceRoom', `카테고리를 찾을 수 없습니다: ${settings.categoryId}`);
        return;
      }
      
      // 사용자 이름 (별명 우선)
      const userName = member.nickname || member.user.username;
      
      // 채널 생성
      const voiceChannel = await guild.channels.create({
        name: `🔊 ${userName}님의 룸`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          },
          {
            id: member.id, // 생성자
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.MuteMembers,
              PermissionFlagsBits.DeafenMembers,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers
            ]
          }
        ]
      });
      
      logger.success('VoiceRoom', `${userName}님의 보이스룸이 생성되었습니다.`);
      
      // 활성 보이스룸 맵에 추가
      activeVoiceRooms.set(voiceChannel.id, {
        ownerId: member.id,
        createdAt: Date.now(),
        type: 'default'
      });
      
      // 사용자를 새 채널로 이동
      await member.voice.setChannel(voiceChannel);
      
      // DM으로 컨트롤 패널 전송
      sendControlPanel(member.user, voiceChannel);
    } catch (error) {
      logger.error('VoiceRoom', `음성 채널 생성 중 오류 발생: ${error.message}`);
    }
  }
  
  /**
   * 컨트롤 패널 전송
   * @param {User} user 사용자
   * @param {VoiceChannel} voiceChannel 음성 채널
   */
  async function sendControlPanel(user, voiceChannel) {
    try {
      // 임베드 생성
      const embed = new EmbedBuilder()
        .setAuthor({ 
          name: 'Aimbot.ad', 
          iconURL: 'https://imgur.com/Sd8qK9c.gif' 
        })
        .setTitle('🎮 보이스룸 컨트롤 패널')
        .setDescription('아래 메뉴를 통해 보이스룸을 관리할 수 있습니다.')
        .addFields(
          { name: '🔔 통화방 권한 확인', value: '현재 통화방에 대한 권한을 확인합니다.' },
          { name: '🔕 통화방 권한 양도', value: '통화방 권한을 다른 사용자에게 양도합니다.' },
          { name: '🔊 통화방 이름 변경', value: '통화방의 이름을 변경합니다. (🔊 아이콘은 유지됩니다)' }
        )
        .setColor('#5865F2')
        .setThumbnail('https://i.imgur.com/6YToyEF.png')
        .setFooter({
          text: '🎷Blues',
          iconURL: voiceChannel.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();
      
      // 드롭다운 메뉴 생성
      const roomTypeRow = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`voiceroom_type_${voiceChannel.id}`)
            .setPlaceholder('통화방 유형을 선택해주세요')
            .addOptions([
              {
                label: '일반 대화',
                description: '일반적인 대화를 위한 채널로 설정합니다.',
                value: 'general',
                emoji: '🔋'
              },
              {
                label: '사냥 파티',
                description: '게임 사냥 파티를 위한 채널로 설정합니다.',
                value: 'hunting',
                emoji: '🏹'
              },
              {
                label: '교역 파티',
                description: '게임 교역을 위한 채널로 설정합니다.',
                value: 'trading',
                emoji: '🪙'
              },
              {
                label: '스터디룸',
                description: '공부를 위한 채널로 설정합니다.',
                value: 'study',
                emoji: '🎓'
              },
              {
                label: '뮤직룸',
                description: '음악 감상을 위한 채널로 설정합니다.',
                value: 'music',
                emoji: '🎶'
              }
            ])
        );
      
      // 버튼 생성
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`voiceroom_check_${voiceChannel.id}`)
            .setLabel('권한 확인')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔔'),
          new ButtonBuilder()
            .setCustomId(`voiceroom_transfer_${voiceChannel.id}`)
            .setLabel('권한 양도')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔕'),
          new ButtonBuilder()
            .setCustomId(`voiceroom_rename_${voiceChannel.id}`)
            .setLabel('이름 변경')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊')
        );
      
      // DM 전송
      await user.send({ 
        embeds: [embed], 
        components: [roomTypeRow, buttonRow] 
      });
      
      logger.info('VoiceRoom', `${user.tag}님에게 보이스룸 컨트롤 패널을 전송했습니다.`);
    } catch (error) {
      logger.error('VoiceRoom', `컨트롤 패널 전송 중 오류 발생: ${error.message}`);
    }
  }
/**
   * 빈 보이스룸 정리
   * @param {VoiceState} oldState 이전 음성 상태
   */
async function cleanupEmptyVoiceRooms(oldState) {
    try {
      // 채널이 없거나, 사용자가 퇴장하지 않았으면 무시
      if (!oldState.channel) return;
      
      const channelId = oldState.channel.id;
      
      // 활성 보이스룸에 등록된 채널인지 확인
      if (!activeVoiceRooms.has(channelId)) return;
      
      // 채널에 남은 인원이 있는지 확인
      if (oldState.channel.members.size === 0) {
        // 채널 삭제
        await oldState.channel.delete();
        
        // 활성 보이스룸에서 제거
        activeVoiceRooms.delete(channelId);
        
        logger.info('VoiceRoom', `빈 보이스룸을 삭제했습니다: ${oldState.channel.name}`);
      }
    } catch (error) {
      logger.error('VoiceRoom', `보이스룸 정리 중 오류 발생: ${error.message}`);
    }
  }
  
  /**
   * 슬래시 커맨드 처리
   * @param {CommandInteraction} interaction 슬래시 커맨드 인터랙션
   * @returns {boolean} 처리 성공 여부
   */
  async function handleCommands(interaction) {
    if (!interaction.isCommand()) return false;
    
    const { commandName, options, guildId } = interaction;
    
    // 보이스룸 관련 명령어가 아니면 무시
    if (commandName !== '보이스룸') return false;
    
    try {
      const subcommand = options.getSubcommand();
      
      // 서버 설정 초기화
      if (!voiceData[guildId]) {
        voiceData[guildId] = {
          categoryId: null,
          lobbyId: null
        };
      }
      
      if (subcommand === '카테고리지정') {
        const category = options.getChannel('카테고리');
        
        voiceData[guildId].categoryId = category.id;
        saveVoiceData();
        
        await interaction.reply({
          content: `✅ 보이스룸 카테고리가 \`${category.name}\`으로 설정되었습니다.`,
          ephemeral: true
        });
        
        logger.info('VoiceRoom', `서버 ${guildId}의 보이스룸 카테고리가 '${category.name}'으로 설정되었습니다.`);
        return true;
      }
      
      if (subcommand === '통화방지정') {
        const channel = options.getChannel('채널');
        
        voiceData[guildId].lobbyId = channel.id;
        saveVoiceData();
        
        await interaction.reply({
          content: `✅ 보이스룸 생성 채널이 \`${channel.name}\`으로 설정되었습니다.`,
          ephemeral: true
        });
        
        logger.info('VoiceRoom', `서버 ${guildId}의 보이스룸 생성 채널이 '${channel.name}'으로 설정되었습니다.`);
        return true;
      }
      
      if (subcommand === '설정확인') {
        const settings = voiceData[guildId];
        const categoryName = settings && settings.categoryId 
          ? interaction.guild.channels.cache.get(settings.categoryId)?.name || '찾을 수 없음'
          : '설정되지 않음';
          
        const lobbyName = settings && settings.lobbyId
          ? interaction.guild.channels.cache.get(settings.lobbyId)?.name || '찾을 수 없음'
          : '설정되지 않음';
        
        // 임베드 생성
        const embed = new EmbedBuilder()
          .setAuthor({ 
            name: 'Aimbot.ad', 
            iconURL: 'https://imgur.com/Sd8qK9c.gif' 
          })
          .setTitle('⚙️ 보이스룸 설정 확인')
          .addFields(
            { name: '카테고리', value: categoryName, inline: true },
            { name: '통화방', value: lobbyName, inline: true }
          )
          .setColor('#5865F2')
          .setFooter({
            text: '🎷Blues',
            iconURL: interaction.guild.iconURL({ dynamic: true })
          })
          .setTimestamp();
        
        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('VoiceRoom', `명령어 처리 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 명령어 처리 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  }
/**
   * 버튼 인터랙션 처리
   * @param {ButtonInteraction} interaction 버튼 인터랙션
   * @returns {boolean} 처리 성공 여부
   */
async function handleButtons(interaction) {
    if (!interaction.isButton()) return false;
    
    const { customId, user } = interaction;
    
    // 보이스룸 관련 버튼이 아니면 무시
    if (!customId.startsWith('voiceroom_')) return false;
    
    try {
      // 커스텀 ID 파싱 (형식: voiceroom_action_channelId)
      const [, action, channelId] = customId.split('_');
      
      // 채널 가져오기
      const channel = client.channels.cache.get(channelId);
      
      // 채널이 존재하지 않거나 권한이 없는 경우
      if (!channel) {
        await interaction.reply({
          content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
          ephemeral: true
        });
        return true;
      }
      
      // 보이스룸 정보 가져오기
      const voiceRoomInfo = activeVoiceRooms.get(channelId);
      
      // 정보가 없거나 소유자가 아닌 경우
      if (!voiceRoomInfo || voiceRoomInfo.ownerId !== user.id) {
        await interaction.reply({
          content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
          ephemeral: true
        });
        return true;
      }
      
      // 권한 확인
      if (action === 'check') {
        await handlePermissionCheck(interaction, channel);
        return true;
      }
      
      // 권한 양도
      if (action === 'transfer') {
        await handlePermissionTransfer(interaction, channel);
        return true;
      }
      
      // 이름 변경
      if (action === 'rename') {
        // voiceroomManager.js 모듈에 처리 위임
        const voiceroomManager = client.modules.get('voiceroomManager');
        if (voiceroomManager && typeof voiceroomManager.showRenameModal === 'function') {
          await voiceroomManager.showRenameModal(interaction, channelId);
        } else {
          await interaction.reply({
            content: '⚠️ 이름 변경 기능을 사용할 수 없습니다.',
            ephemeral: true
          });
        }
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('VoiceRoom', `버튼 처리 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 버튼 처리 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  }
  
  /**
   * 권한 확인 처리
   * @param {ButtonInteraction} interaction 버튼 인터랙션
   * @param {VoiceChannel} channel 음성 채널
   */
  async function handlePermissionCheck(interaction, channel) {
    // 현재 채널 멤버 목록
    const members = channel.members.map(member => 
      `${member.id === activeVoiceRooms.get(channel.id).ownerId ? '👑' : '👤'} ${member.user.tag}`
    ).join('\n') || '없음';
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: 'Aimbot.ad', 
        iconURL: 'https://imgur.com/Sd8qK9c.gif' 
      })
      .setTitle('🔔 보이스룸 권한 확인')
      .setDescription('현재 보이스룸에 대한 권한 정보입니다.')
      .addFields(
        { name: '채널 이름', value: channel.name },
        { name: '소유자', value: `<@${activeVoiceRooms.get(channel.id).ownerId}>` },
        { name: '현재 멤버', value: members }
      )
      .setColor('#5865F2')
      .setFooter({
        text: '🎷Blues',
        iconURL: channel.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  
  /**
   * 권한 양도 처리
   * @param {ButtonInteraction} interaction 버튼 인터랙션
   * @param {VoiceChannel} channel 음성 채널
   */
  async function handlePermissionTransfer(interaction, channel) {
    // 채널 멤버 목록 (소유자 제외)
    const options = channel.members
      .filter(member => member.id !== interaction.user.id)
      .map(member => ({
        label: member.user.tag,
        value: member.id,
        description: `ID: ${member.id}`
      }));
    
    // 채널에 다른 멤버가 없는 경우
    if (options.length === 0) {
      await interaction.reply({
        content: '⚠️ 권한을 양도할 다른 멤버가 없습니다.',
        ephemeral: true
      });
      return;
    }
    
    // 선택 메뉴 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`voiceroom_transfer_select_${channel.id}`)
          .setPlaceholder('권한을 양도할 멤버를 선택해주세요')
          .addOptions(options)
      );
    
    await interaction.reply({
      content: '👑 보이스룸 권한을 양도할 멤버를 선택해주세요:',
      components: [row],
      ephemeral: true
    });
  }
  
  /**
   * 선택 메뉴 처리
   * @param {SelectMenuInteraction} interaction 선택 메뉴 인터랙션
   * @returns {boolean} 처리 성공 여부
   */
  async function handleSelectMenus(interaction) {
    if (!interaction.isStringSelectMenu()) return false;
    
    const { customId, values, user } = interaction;
    
    // 보이스룸 관련 선택 메뉴가 아니면 무시
    if (!customId.startsWith('voiceroom_')) return false;
    
    try {
      // 커스텀 ID 파싱
      const parts = customId.split('_');
      const action = parts[1];
      const channelId = parts[parts.length - 1];
      
      // 채널 가져오기
      const channel = client.channels.cache.get(channelId);
      
      // 채널이 존재하지 않는 경우
      if (!channel) {
        await interaction.reply({
          content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
          ephemeral: true
        });
        return true;
      }
      
      // 보이스룸 타입 변경
      if (action === 'type') {
        await handleRoomTypeChange(interaction, channel, values[0]);
        return true;
      }
      
      // 권한 양도 선택
      if (action === 'transfer' && parts[2] === 'select') {
        await handlePermissionTransferSelect(interaction, channel, values[0]);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('VoiceRoom', `선택 메뉴 처리 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 선택 메뉴 처리 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  }
/**
   * 방 타입 변경 처리
   * @param {SelectMenuInteraction} interaction 선택 메뉴 인터랙션
   * @param {VoiceChannel} channel 음성 채널
   * @param {string} type 방 타입
   */
async function handleRoomTypeChange(interaction, channel, type) {
    try {
      const voiceRoomInfo = activeVoiceRooms.get(channel.id);
      
      // 정보가 없거나 소유자가 아닌 경우
      if (!voiceRoomInfo || voiceRoomInfo.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 타입에 따른 이모지와 접미사
      const typeInfo = {
        general: { emoji: '🔋', name: '일반대화' },
        hunting: { emoji: '🏹', name: '사냥파티' },
        trading: { emoji: '🪙', name: '교역파티' },
        study: { emoji: '🎓', name: '스터디룸' },
        music: { emoji: '🎶', name: '뮤직룸' }
      };
      
      // 타입 정보가 없는 경우
      if (!typeInfo[type]) {
        await interaction.reply({
          content: '⚠️ 잘못된 방 타입입니다.',
          ephemeral: true
        });
        return;
      }
      
      // 사용자 이름 (별명 우선)
      const member = channel.guild.members.cache.get(voiceRoomInfo.ownerId);
      const userName = member ? (member.nickname || member.user.username) : '알 수 없음';
      
      // 새 채널 이름
      const newName = `${typeInfo[type].emoji} ${userName}님의 ${typeInfo[type].name}`;
      
      // 채널 이름 변경
      await channel.setName(newName);
      
      // 활성 보이스룸 정보 업데이트
      activeVoiceRooms.set(channel.id, {
        ...voiceRoomInfo,
        type: type
      });
      
      await interaction.reply({
        content: `✅ 보이스룸이 \`${newName}\`으로 변경되었습니다.`,
        ephemeral: true
      });
      
      logger.info('VoiceRoom', `보이스룸 타입이 변경되었습니다: ${channel.id} -> ${type}`);
    } catch (error) {
      logger.error('VoiceRoom', `방 타입 변경 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 방 타입 변경 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
    }
  }
  
  /**
   * 권한 양도 선택 처리
   * @param {SelectMenuInteraction} interaction 선택 메뉴 인터랙션
   * @param {VoiceChannel} channel 음성 채널
   * @param {string} newOwnerId 새 소유자 ID
   */
  async function handlePermissionTransferSelect(interaction, channel, newOwnerId) {
    try {
      const voiceRoomInfo = activeVoiceRooms.get(channel.id);
      
      // 정보가 없거나 소유자가 아닌 경우
      if (!voiceRoomInfo || voiceRoomInfo.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 새 소유자 가져오기
      const newOwner = channel.guild.members.cache.get(newOwnerId);
      
      // 멤버가 없는 경우
      if (!newOwner) {
        await interaction.reply({
          content: '⚠️ 선택한 멤버를 찾을 수 없습니다.',
          ephemeral: true
        });
        return;
      }
      
      // 이전 소유자
      const oldOwner = channel.guild.members.cache.get(voiceRoomInfo.ownerId);
      
      // 권한 업데이트
      if (oldOwner) {
        // 이전 소유자 권한 제거
        await channel.permissionOverwrites.edit(oldOwner.id, {
          Connect: true,
          Speak: true,
          MuteMembers: false,
          DeafenMembers: false,
          ManageChannels: false,
          MoveMembers: false
        });
      }
      
      // 새 소유자 권한 추가
      await channel.permissionOverwrites.edit(newOwner.id, {
        Connect: true,
        Speak: true,
        MuteMembers: true,
        DeafenMembers: true,
        ManageChannels: true,
        MoveMembers: true
      });
      
      // 활성 보이스룸 정보 업데이트
      activeVoiceRooms.set(channel.id, {
        ...voiceRoomInfo,
        ownerId: newOwnerId
      });
      
      await interaction.reply({
        content: `✅ 보이스룸 권한이 <@${newOwnerId}>님에게 양도되었습니다.`,
        ephemeral: true
      });
      
      // 새 소유자에게 컨트롤 패널 전송
      sendControlPanel(newOwner.user, channel);
      
      logger.info('VoiceRoom', `보이스룸 권한이 양도되었습니다: ${channel.id} -> ${newOwnerId}`);
    } catch (error) {
      logger.error('VoiceRoom', `권한 양도 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 권한 양도 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
    }
  }
  
  /**
   * 모달 처리
   * @param {ModalSubmitInteraction} interaction 모달 인터랙션
   * @returns {boolean} 처리 성공 여부
   */
  async function handleModals(interaction) {
    if (!interaction.isModalSubmit()) return false;
    
    const { customId, user } = interaction;
    
    // 보이스룸 관련 모달이 아니면 무시
    if (!customId.startsWith('voiceroom_rename_modal_')) return false;
    
    try {
      // 채널 ID 추출
      const channelId = customId.replace('voiceroom_rename_modal_', '');
      
      // 채널 가져오기
      const channel = client.channels.cache.get(channelId);
      
      // 채널이 존재하지 않는 경우
      if (!channel) {
        await interaction.reply({
          content: '⚠️ 해당 보이스룸이 더 이상 존재하지 않습니다.',
          ephemeral: true
        });
        return true;
      }
      
      // 보이스룸 정보 가져오기
      const voiceRoomInfo = activeVoiceRooms.get(channelId);
      
      // 정보가 없거나 소유자가 아닌 경우
      if (!voiceRoomInfo || voiceRoomInfo.ownerId !== user.id) {
        await interaction.reply({
          content: '⚠️ 이 보이스룸에 대한 권한이 없습니다.',
          ephemeral: true
        });
        return true;
      }
      
      // 입력된 이름 가져오기
      const customName = interaction.fields.getTextInputValue('room_name');
      
      // 타입에 따른 이모지
      const typeInfo = {
        general: '🔋',
        hunting: '🏹',
        trading: '🪙',
        study: '🎓',
        music: '🎶',
        default: '🔊'
      };
      
      // 현재 타입
      const type = voiceRoomInfo.type || 'default';
      
      // 새 채널 이름
      const newName = `${typeInfo[type]} ${customName}`;
      
      // 채널 이름 변경
      await channel.setName(newName);
      
      await interaction.reply({
        content: `✅ 보이스룸 이름이 \`${newName}\`으로 변경되었습니다.`,
        ephemeral: true
      });
      
      logger.info('VoiceRoom', `보이스룸 이름이 변경되었습니다: ${channel.id} -> ${newName}`);
      
      return true;
    } catch (error) {
      logger.error('VoiceRoom', `모달 처리 중 오류 발생: ${error.message}`);
      
      await interaction.reply({
        content: `⚠️ 모달 처리 중 오류가 발생했습니다: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  }
  
  // 모듈 초기화
  initialize();
  
  // 모듈 객체 반환
  return {
    name: 'voiceroom',
    description: '커스텀 보이스룸 생성 및 관리 기능',
    enabled: true,
    configurable: true,
    commands: ['보이스룸'],
    slashCommands: slashCommands,
    handleCommands,
    handleButtons,
    handleSelectMenus,
    handleModals,
    // 외부 참조를 위한 추가 메서드
    isActiveVoiceRoom: (channelId) => activeVoiceRooms.has(channelId),
    isVoiceRoomOwnedBy: (channelId, userId) => {
      const info = activeVoiceRooms.get(channelId);
      return info && info.ownerId === userId;
    },
    getVoiceRoomInfo: (channelId) => activeVoiceRooms.get(channelId),
    removeVoiceRoom: (channelId) => activeVoiceRooms.delete(channelId)
  };
};