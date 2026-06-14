use crate::core::device::{DeviceInfo, DeviceType};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::mpsc;

pub struct MdnsDiscovery {
    daemon: ServiceDaemon,
    _device_id: uuid::Uuid,
}

impl MdnsDiscovery {
    pub fn start(
        device_id: uuid::Uuid,
        device_name: &str,
    ) -> Result<(Self, mpsc::Receiver<DiscoveredEvent>), crate::AppError> {
        let daemon = ServiceDaemon::new()?;

        let mut props = HashMap::new();
        props.insert("id".to_string(), device_id.to_string());
        props.insert("name".to_string(), device_name.to_string());
        props.insert("type".to_string(), "desktop".to_string());

        let service = ServiceInfo::new(
            "_rust-send._tcp",
            device_name,
            &format!("{}.local.", device_name),
            std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
            0,
            props,
        )?;
        daemon.register(service)?;

        let receiver = daemon.browse("_rust-send._tcp")?;
        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            // 跟踪 fullname → device_id 映射，用于离线检测
            let mut name_map: HashMap<String, uuid::Uuid> = HashMap::new();

            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let id: uuid::Uuid = match info.get_property("id") {
                            Some(val) => match val.to_string().parse() {
                                Ok(id) => id,
                                Err(_) => continue,
                            },
                            None => continue,
                        };

                        // 跳过自己
                        if id == device_id {
                            continue;
                        }

                        let name = match info.get_property("name") {
                            Some(n) => n.to_string(),
                            None => continue,
                        };
                        let addr = info.get_addresses().into_iter().next().copied();

                        // 记录 fullname → id 映射
                        name_map.insert(info.get_fullname().to_string(), id);

                        let _ = tx.send(DiscoveredEvent::Found(DeviceInfo {
                            id,
                            name,
                            device_type: DeviceType::Desktop,
                            addr: addr.and_then(|a| Some(SocketAddr::new(a, 0))),
                            last_seen: chrono::Utc::now(),
                        }));
                    }
                    ServiceEvent::ServiceRemoved(_service_type, fullname) => {
                        if let Some(id) = name_map.remove(&fullname) {
                            let _ = tx.send(DiscoveredEvent::Lost(id));
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok((
            Self {
                daemon,
                _device_id: device_id,
            },
            rx,
        ))
    }

    pub fn update_name(&self, new_name: &str) -> Result<(), crate::AppError> {
        let mut props = HashMap::new();
        props.insert("id".to_string(), self._device_id.to_string());
        props.insert("name".to_string(), new_name.to_string());
        props.insert("type".to_string(), "desktop".to_string());

        let service = ServiceInfo::new(
            "_rust-send._tcp",
            new_name,
            &format!("{}.local.", new_name),
            std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
            0,
            props,
        )?;
        self.daemon.register(service)?;
        Ok(())
    }
}

impl Drop for MdnsDiscovery {
    fn drop(&mut self) {
        let _ = self.daemon.shutdown();
    }
}

pub enum DiscoveredEvent {
    Found(DeviceInfo),
    Lost(uuid::Uuid),
}
